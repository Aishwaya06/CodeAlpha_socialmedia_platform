const API_BASE = "/api";

let csrfToken = null;

export class ApiError extends Error {
  constructor(message, statusCode = 0, details = null) {
    super(message);
    this.name = "ApiError";
    this.status = statusCode;
    this.details = details;
  }
}

function resolveUrl(path) {
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith(`${API_BASE}/`)) {
    throw new ApiError("The requested API address is not on this site.");
  }
  return url;
}

function formatErrors(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(formatErrors).filter(Boolean).join(" ");
  if (value && typeof value === "object") {
    const preferred = value.detail || value.non_field_errors;
    if (preferred) return formatErrors(preferred);
    return Object.entries(value)
      .map(([field, message]) => `${field.replaceAll("_", " ")}: ${formatErrors(message)}`)
      .filter(Boolean)
      .join(" ");
  }
  return "The request could not be completed.";
}

async function readResponse(response) {
  if (response.status === 204) return null;
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  const text = await response.text();
  return text ? { detail: text } : null;
}

async function fetchCsrfToken() {
  let response;
  try {
    response = await fetch(`${API_BASE}/auth/csrf/`, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new ApiError("Connectly could not reach the server. Check your connection and try again.");
  }
  const data = await readResponse(response);
  if (!response.ok || !data?.csrfToken) {
    throw new ApiError(formatErrors(data) || "Could not start a secure session.", response.status, data);
  }
  csrfToken = data.csrfToken;
  return csrfToken;
}

async function request(path, { method = "GET", body, formData = false } = {}) {
  const url = resolveUrl(path);
  const verb = method.toUpperCase();
  const unsafe = !["GET", "HEAD", "OPTIONS", "TRACE"].includes(verb);
  const headers = { Accept: "application/json" };

  if (unsafe) {
    if (!csrfToken) await fetchCsrfToken();
    headers["X-CSRFToken"] = csrfToken;
  }
  if (body !== undefined && !formData) headers["Content-Type"] = "application/json";

  let response;
  try {
    response = await fetch(url, {
      method: verb,
      credentials: "same-origin",
      headers,
      body: body === undefined ? undefined : formData ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Connectly could not reach the server. Check your connection and try again.");
  }

  const data = await readResponse(response);
  if (!response.ok) {
    const message = formatErrors(data) || `The request failed (${response.status}).`;
    throw new ApiError(message, response.status, data);
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body = {}) => request(path, { method: "POST", body }),
  patch: (path, body) => request(path, { method: "PATCH", body }),
  patchForm: (path, body) => request(path, { method: "PATCH", body, formData: true }),
  delete: (path) => request(path, { method: "DELETE" }),
  refreshCsrf: fetchCsrfToken,
  register: (payload) => request("/api/auth/register/", { method: "POST", body: payload }),
  login: (payload) => request("/api/auth/login/", { method: "POST", body: payload }),
  logout: () => request("/api/auth/logout/", { method: "POST", body: {} }),
  currentUser: () => request("/api/auth/me/"),
};
