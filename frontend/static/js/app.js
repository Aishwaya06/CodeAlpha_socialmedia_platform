import { api, ApiError } from "./api.js";

const AVATAR_FALLBACK = "/static/images/default-avatar.svg";
const state = {
  user: null,
  route: { name: "feed" },
  routeVersion: 0,
  feed: { items: [], next: null },
  profile: null,
  profileAnimationPending: false,
  profilePosts: { items: [], next: null },
  discovery: { items: [], next: null, search: "" },
  comments: new Map(),
  openComments: new Set(),
  editingPostId: null,
  modal: null,
};

const page = document.getElementById("page");
const topbar = document.getElementById("topbar");
const leftRail = document.getElementById("left-rail");
const rightRail = document.getElementById("right-rail");
const appShell = document.getElementById("app-shell");
const toastRegion = document.getElementById("toast-region");
const modalRoot = document.getElementById("modal-root");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function safeText(value) {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function avatar(url, name, extraClass = "") {
  const source = url || AVATAR_FALLBACK;
  return `<img class="avatar ${extraClass}" src="${escapeHtml(source)}" alt="${escapeHtml(name || "Profile picture")}" loading="lazy">`;
}

function profileHref(username) {
  return `#/profile/${encodeURIComponent(username)}`;
}

function currentAvatar() {
  return state.user && state.profile?.username === state.user.username
    ? state.profile.profile_picture
    : AVATAR_FALLBACK;
}

function relativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const ranges = [
    [60, "second"], [3600, "minute"], [86400, "hour"], [604800, "day"],
    [2629800, "week"], [31557600, "month"], [Infinity, "year"],
  ];
  let divisor = 1;
  let unit = "second";
  for (const [limit, candidate] of ranges) {
    if (Math.abs(seconds) < limit) { unit = candidate; break; }
    divisor = limit;
  }
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(Math.round(seconds / divisor), unit);
}

function showToast(message, kind = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${kind}`;
  toast.setAttribute("role", kind === "error" ? "alert" : "status");
  toast.textContent = message;
  toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

function currentRoute() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (!hash) return { name: "feed" };
  const [path, query = ""] = hash.split("?");
  const [section, ...rest] = path.split("/");
  if (section === "login" || section === "register" || section === "discover" || section === "feed") {
    return { name: section, postId: new URLSearchParams(query).get("post") };
  }
  if (section === "profile") return { name: "profile", username: decodeURIComponent(rest.join("/")) };
  return { name: "feed" };
}

function navigate(path) {
  const next = `#/${path.replace(/^\/+/, "")}`;
  if (window.location.hash === next) loadRoute();
  else window.location.hash = next;
}

function renderChrome() {
  const isAuthPage = state.route.name === "login" || state.route.name === "register";
  appShell.classList.toggle("auth-shell", isAuthPage);
  topbar.innerHTML = `
    <div class="topbar-inner">
      <a class="brand" href="#/feed" aria-label="Connectly home"><span class="brand-mark">c</span><span>connectly</span></a>
      <nav class="top-navigation" aria-label="Primary">
        <a class="top-link ${state.route.name === "feed" ? "active" : ""}" href="#/feed" ${state.route.name === "feed" ? 'aria-current="page"' : ""}><span aria-hidden="true">⌂</span> Feed</a>
        <a class="top-link ${state.route.name === "discover" ? "active" : ""}" href="#/discover" ${state.route.name === "discover" ? 'aria-current="page"' : ""}><span aria-hidden="true">⌕</span> Discover</a>
      </nav>
      <div class="top-account">
        ${state.user ? `
          <a class="account-link" href="${profileHref(state.user.username)}">${avatar(currentAvatar(), state.user.username, "avatar-small")}<span>@${escapeHtml(state.user.username)}</span></a>
          <button class="button button-quiet button-small" data-action="logout" type="button">Log out</button>
        ` : `
          <a class="button button-quiet button-small" href="#/login">Log in</a>
          <a class="button button-primary button-small" href="#/register">Join Connectly</a>
        `}
      </div>
    </div>`;

  if (isAuthPage) {
    leftRail.innerHTML = "";
    rightRail.innerHTML = "";
    return;
  }

  leftRail.innerHTML = `
    <div class="rail-card nav-card">
      <p class="rail-label">YOUR SPACE</p>
      <a class="rail-link ${state.route.name === "feed" ? "active" : ""}" href="#/feed" ${state.route.name === "feed" ? 'aria-current="page"' : ""}><span class="rail-icon">⌂</span><span>Home feed</span></a>
      <a class="rail-link ${state.route.name === "discover" ? "active" : ""}" href="#/discover" ${state.route.name === "discover" ? 'aria-current="page"' : ""}><span class="rail-icon">⌕</span><span>Discover people</span></a>
      ${state.user ? `<a class="rail-link ${state.route.name === "profile" && state.route.username === state.user.username ? "active" : ""}" href="${profileHref(state.user.username)}" ${state.route.name === "profile" && state.route.username === state.user.username ? 'aria-current="page"' : ""}><span class="rail-icon">◉</span><span>Your profile</span></a>` : `<a class="rail-link" href="#/login"><span class="rail-icon">◉</span><span>Your profile</span></a>`}
    </div>
    <div class="rail-note"><span class="note-spark">✦</span><strong>Good conversations start with a hello.</strong><span>Find your people and share what’s on your mind.</span></div>`;

  rightRail.innerHTML = `
    <div class="rail-card right-card">
      <div class="side-title"><span>Made for connection</span><span class="tiny-dot"></span></div>
      <p>Share a thought, join a conversation, and keep up with the people you care about.</p>
      <a class="text-link" href="#/discover">Meet the community <span aria-hidden="true">→</span></a>
    </div>
    <div class="right-footer"><span>Connectly</span><span>Small moments, shared.</span></div>`;
}

function loadingState(label = "Loading") {
  return `<div class="loading-card"><span class="spinner" aria-hidden="true"></span><span>${escapeHtml(label)}…</span></div>`;
}

function errorState(message, retryAction) {
  return `<section class="state-card state-error"><div class="state-icon">!</div><h2>That didn’t work</h2><p>${escapeHtml(message)}</p><button class="button button-secondary" type="button" data-action="${escapeHtml(retryAction)}">Try again</button></section>`;
}

function emptyState(title, message, actionLabel = "", actionHref = "") {
  return `<section class="state-card"><div class="state-icon">✦</div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p>${actionLabel ? `<a class="button button-secondary" href="${escapeHtml(actionHref)}">${escapeHtml(actionLabel)}</a>` : ""}</section>`;
}

function updatePostInLists(postId, transform) {
  for (const list of [state.feed.items, state.profilePosts.items]) {
    const index = list.findIndex((item) => item.id === postId);
    if (index >= 0) list[index] = transform(list[index]);
  }
}

function removePostFromLists(postId) {
  state.feed.items = state.feed.items.filter((post) => post.id !== postId);
  state.profilePosts.items = state.profilePosts.items.filter((post) => post.id !== postId);
}

function commentMarkup(comment) {
  const isOwner = state.user && comment.author.username === state.user.username;
  return `<article class="comment-row">
    ${avatar(comment.author.profile_picture, comment.author.username, "avatar-tiny")}
    <div class="comment-body"><div class="comment-heading"><button class="author-name" type="button" data-action="open-profile" data-username="${escapeHtml(comment.author.username)}">@${escapeHtml(comment.author.username)}</button><time title="${escapeHtml(new Date(comment.created_at).toLocaleString())}">${escapeHtml(relativeTime(comment.created_at))}</time></div>
      <p>${safeText(comment.content)}</p></div>
    ${isOwner ? `<button class="icon-button comment-delete" type="button" data-action="delete-comment" data-comment-id="${comment.id}" aria-label="Delete your comment" title="Delete comment">×</button>` : ""}
  </article>`;
}

function postMarkup(post) {
  const ownPost = state.user && post.author.username === state.user.username;
  const editing = state.editingPostId === post.id;
  const expanded = state.openComments.has(post.id);
  const commentsState = state.comments.get(post.id);
  return `<article class="post-card" data-post-card="${post.id}">
    <header class="post-header">
      <button class="post-author" type="button" data-action="open-profile" data-username="${escapeHtml(post.author.username)}">
        ${avatar(post.author.profile_picture, post.author.username, "avatar-medium")}
        <span class="author-meta"><strong>${escapeHtml(post.author.full_name || `@${post.author.username}`)}</strong><span>@${escapeHtml(post.author.username)}</span></span>
      </button>
      <div class="post-header-right"><time title="${escapeHtml(new Date(post.created_at).toLocaleString())}">${escapeHtml(relativeTime(post.created_at))}</time>
        ${ownPost ? `<div class="post-owner-actions"><button class="icon-button" type="button" data-action="edit-post" data-post-id="${post.id}" aria-label="Edit post" title="Edit post">✎</button><button class="icon-button danger-hover" type="button" data-action="delete-post" data-post-id="${post.id}" aria-label="Delete post" title="Delete post">⌫</button></div>` : ""}
      </div>
    </header>
    ${editing ? `<form class="edit-post-form" data-form="edit-post" data-post-id="${post.id}"><label class="sr-only" for="edit-post-${post.id}">Edit post</label><textarea id="edit-post-${post.id}" name="content" maxlength="5000" required>${escapeHtml(post.content)}</textarea><div class="form-actions"><button class="button button-quiet" type="button" data-action="cancel-edit">Cancel</button><button class="button button-primary" type="submit">Save changes</button></div><p class="form-error" aria-live="polite"></p></form>` : `<p class="post-content">${safeText(post.content)}</p>`}
    <div class="post-divider"></div>
    <div class="post-actions">
      <button class="post-action ${post.is_liked ? "liked" : ""}" type="button" data-action="toggle-like" data-post-id="${post.id}" aria-label="${post.is_liked ? "Unlike" : "Like"} this post; ${post.like_count} ${post.like_count === 1 ? "like" : "likes"}" aria-pressed="${post.is_liked}"><span class="heart" aria-hidden="true">${post.is_liked ? "♥" : "♡"}</span><span>${post.like_count} ${post.like_count === 1 ? "like" : "likes"}</span></button>
      <button class="post-action" type="button" data-action="toggle-comments" data-post-id="${post.id}" aria-expanded="${expanded}"><span aria-hidden="true">▢</span><span>${post.comment_count} ${post.comment_count === 1 ? "comment" : "comments"}</span></button>
      <button class="post-action post-share" type="button" data-action="copy-post-link" data-post-id="${post.id}" aria-label="Copy post link"><span aria-hidden="true">↗</span><span>Share</span></button>
    </div>
    ${expanded ? `<section class="comments-panel" aria-label="Comments">
      ${commentsState?.loading ? `<div class="inline-loading"><span class="spinner spinner-small"></span>Loading comments…</div>` : ""}
      ${commentsState?.error ? `<p class="inline-error">${escapeHtml(commentsState.error)}</p>` : ""}
      ${commentsState && !commentsState.loading && !commentsState.error && commentsState.items.length === 0 ? `<p class="comments-empty">No comments yet. Start the conversation.</p>` : ""}
      ${(commentsState?.items || []).map(commentMarkup).join("")}
      ${commentsState?.next ? `<button class="button button-quiet button-small comments-more" data-action="more-comments" data-post-id="${post.id}" type="button">Load earlier comments</button>` : ""}
      ${state.user ? `<form class="comment-form" data-form="comment" data-post-id="${post.id}"><label class="sr-only" for="comment-${post.id}">Write a comment</label><input id="comment-${post.id}" name="content" maxlength="2000" placeholder="Write a comment…" required><button class="button button-primary button-small" type="submit">Send</button><p class="form-error" aria-live="polite"></p></form>` : `<p class="comments-signin"><a href="#/login">Sign in</a> to join the conversation.</p>`}
    </section>` : ""}
  </article>`;
}

function renderPostList(posts, next, moreAction, emptyTitle, emptyMessage) {
  if (!posts.length) return emptyState(emptyTitle, emptyMessage);
  return `${posts.map(postMarkup).join("")}${next ? `<div class="load-more-wrap"><button class="button button-secondary" type="button" data-action="${moreAction}">Load more</button></div>` : ""}`;
}

function renderComposer() {
  if (!state.user) {
    return `<section class="composer-card guest-composer"><div class="composer-greeting"><span class="compose-icon">✦</span><div><strong>Your voice belongs here.</strong><p>Sign in to share something with the community.</p></div></div><div class="guest-actions"><a class="button button-primary" href="#/login">Log in</a><a class="button button-quiet" href="#/register">Create an account</a></div></section>`;
  }
  return `<form class="composer-card" data-form="create-post"><div class="composer-top">${avatar(currentAvatar(), state.user.username, "avatar-medium")}<label class="sr-only" for="new-post">What’s on your mind?</label><textarea id="new-post" name="content" maxlength="5000" aria-describedby="post-character-count" placeholder="What’s on your mind, @${escapeHtml(state.user.username)}?" required></textarea></div><div class="composer-bottom"><div class="composer-meta"><span class="composer-hint">A little kindness goes a long way.</span><output class="character-count" id="post-character-count" data-character-count aria-label="0 of 5000 characters used">0 / 5,000</output></div><div class="composer-actions"><p class="form-error" aria-live="polite"></p><button class="button button-primary" type="submit" disabled><span aria-hidden="true">＋</span> Share post</button></div></div></form>`;
}

function renderFeed() {
  page.innerHTML = `<div class="feed-layout"><section class="main-column"><div class="page-heading"><div><p class="eyebrow">YOUR COMMUNITY</p><h1>Home feed</h1><p class="page-subtitle">The latest from people on Connectly.</p></div><span class="heading-spark" aria-hidden="true">✦</span></div>${renderComposer()}<div class="section-heading"><h2>Latest posts</h2><span class="live-label"><i></i> Live from Connectly</span></div><div id="post-list">${renderPostList(state.feed.items, state.feed.next, "more-feed", "A quiet moment", "There are no posts here yet. Be the first to start a conversation.")}</div></section><aside class="feed-aside"><div class="aside-art"><div class="art-orbit orbit-one"></div><div class="art-orbit orbit-two"></div><div class="art-center">c</div><span class="art-star star-one">✦</span><span class="art-star star-two">✳</span><span class="art-dot"></span></div><p class="aside-kicker">A little closer</p><h2>Community is built one post at a time.</h2><p>Share your perspective and make room for someone else’s.</p><a href="#/discover" class="text-link">Find new voices <span aria-hidden="true">→</span></a></aside></div>`;
}

function renderAuthPage(mode) {
  const registration = mode === "register";
  page.innerHTML = `<div class="auth-layout"><section class="auth-promo"><a class="brand brand-light" href="#/feed"><span class="brand-mark">c</span><span>connectly</span></a><div class="promo-copy"><span class="promo-spark">✦</span><p class="eyebrow">A SOCIAL SPACE THAT FEELS LIKE YOURS</p><h1>Good things happen when we <em>connect.</em></h1><p>Find your people, share your everyday, and make the internet feel a little more human.</p></div><div class="promo-bottom"><span>Here for the little moments.</span><span class="promo-decoration">✳</span></div></section><section class="auth-panel"><div class="auth-form-wrap"><div class="mobile-auth-brand"><a class="brand" href="#/feed"><span class="brand-mark">c</span><span>connectly</span></a></div><p class="eyebrow">${registration ? "YOUR NEXT CHAPTER" : "WELCOME BACK"}</p><h2>${registration ? "Create your account" : "Good to see you again"}</h2><p class="auth-subtitle">${registration ? "A few details and you’re part of the community." : "Pick up where your conversations left off."}</p><form data-form="${registration ? "register" : "login"}" class="auth-form" novalidate>
      ${registration ? `<div class="field"><label for="register-username">Username</label><input id="register-username" name="username" autocomplete="username" maxlength="150" required placeholder="Choose a username"></div><div class="field"><label for="register-email">Email address</label><input id="register-email" name="email" type="email" autocomplete="email" required placeholder="you@example.com"></div>` : `<div class="field"><label for="login-username">Username</label><input id="login-username" name="username" autocomplete="username" required placeholder="Your username"></div>`}
      <div class="field"><label for="${registration ? "register-password" : "login-password"}">Password</label><input id="${registration ? "register-password" : "login-password"}" name="password" type="password" autocomplete="${registration ? "new-password" : "current-password"}" required placeholder="${registration ? "At least 8 characters" : "Your password"}"></div>
      ${registration ? `<div class="field"><label for="register-confirm">Confirm password</label><input id="register-confirm" name="password_confirmation" type="password" autocomplete="new-password" required placeholder="Enter your password again"></div><p class="field-help">Use a unique password that isn’t easy to guess.</p>` : ""}
      <p class="form-error auth-error" aria-live="polite"></p><button class="button button-primary button-wide" type="submit">${registration ? "Create account" : "Log in"}<span aria-hidden="true">→</span></button></form><p class="auth-switch">${registration ? `Already have an account? <a href="#/login">Log in</a>` : `New to Connectly? <a href="#/register">Create an account</a>`}</p><p class="auth-terms">By continuing, you agree to be kind and make room for other voices.</p></div></section></div>`;
}

function profileCard(profile, includeFollow = true) {
  const following = profile.is_following;
  return `<article class="person-card"><button class="person-main" type="button" data-action="open-profile" data-username="${escapeHtml(profile.username)}">${avatar(profile.profile_picture, profile.username, "avatar-large")}<span class="person-copy"><strong>${escapeHtml(profile.full_name || `@${profile.username}`)}</strong><span>@${escapeHtml(profile.username)}</span>${profile.bio ? `<small>${safeText(profile.bio)}</small>` : ""}</span></button><div class="person-stats"><span><strong>${profile.post_count}</strong> posts</span><span><strong>${profile.follower_count}</strong> followers</span></div>${includeFollow ? (state.user ? `<button class="button ${following ? "button-secondary is-following" : "button-primary"} follow-button" data-action="toggle-follow" data-username="${escapeHtml(profile.username)}" type="button">${following ? "Following" : "Follow"}</button>` : `<a class="button button-secondary follow-button" href="#/login">Follow</a>`) : ""}</article>`;
}

function renderDiscovery() {
  page.innerHTML = `<div class="narrow-column"><div class="page-heading discovery-heading"><div><p class="eyebrow">FIND YOUR PEOPLE</p><h1>Discover</h1><p class="page-subtitle">Good conversations can start anywhere.</p></div><span class="heading-spark" aria-hidden="true">✦</span></div><form class="search-form" data-form="discovery-search"><label class="sr-only" for="people-search">Search usernames</label><span aria-hidden="true">⌕</span><input id="people-search" name="search" value="${escapeHtml(state.discovery.search)}" placeholder="Search by username"><button class="button button-primary" type="submit">Search</button></form><div class="section-heading"><h2>${state.discovery.search ? `Results for “${escapeHtml(state.discovery.search)}”` : "People to know"}</h2><span class="result-note">${state.discovery.items.length ? "Real people, real profiles" : ""}</span></div><div id="people-list">${state.discovery.items.length ? `${state.discovery.items.map((person) => profileCard(person)).join("")}${state.discovery.next ? `<div class="load-more-wrap"><button class="button button-secondary" data-action="more-discovery" type="button">Load more people</button></div>` : ""}` : emptyState("No profiles found", state.discovery.search ? "Try a different username." : "There aren’t any profiles to show yet. Check back soon.")}</div></div>`;
}

function renderStats(profile) {
  return `<div class="profile-stats"><button type="button" data-action="show-relations" data-kind="posts"><strong>${profile.post_count}</strong><span>posts</span></button><button type="button" data-action="show-relations" data-kind="followers"><strong>${profile.follower_count}</strong><span>followers</span></button><button type="button" data-action="show-relations" data-kind="following"><strong>${profile.following_count}</strong><span>following</span></button></div>`;
}

function renderProfile() {
  const profile = state.profile;
  const isOwn = state.user && profile.username === state.user.username;
  page.innerHTML = `<div class="profile-layout"><section class="main-column"><article class="profile-card ${state.profileAnimationPending ? "profile-enter" : ""}"><div class="profile-cover"><span class="cover-orb cover-orb-one"></span><span class="cover-orb cover-orb-two"></span><span class="cover-spark">✦</span></div><div class="profile-overview">${avatar(profile.profile_picture, profile.username, "profile-avatar")}<div class="profile-primary"><div class="profile-name-row"><div><p class="eyebrow">CONNECTLY MEMBER</p><h1>${escapeHtml(profile.full_name || profile.username)}</h1><p class="profile-handle">@${escapeHtml(profile.username)}</p></div>${isOwn ? `<button class="button button-secondary" type="button" data-action="toggle-profile-edit">${state.editingProfile ? "Cancel edit" : "Edit profile"}</button>` : state.user ? `<button class="button ${profile.is_following ? "button-secondary is-following" : "button-primary"}" type="button" data-action="toggle-follow" data-username="${escapeHtml(profile.username)}">${profile.is_following ? "Following" : "Follow"}</button>` : `<a class="button button-primary" href="#/login">Follow</a>`}</div>${profile.bio ? `<p class="profile-bio">${safeText(profile.bio)}</p>` : `<p class="profile-bio profile-bio-empty">${isOwn ? "Add a little about yourself to make your profile your own." : "This member hasn’t added a bio yet."}</p>`}${profile.location ? `<p class="profile-location"><span aria-hidden="true">⌖</span>${escapeHtml(profile.location)}</p>` : ""}${renderStats(profile)}</div></div>
      ${isOwn && state.editingProfile ? `<form class="profile-edit-form" data-form="edit-profile"><div class="field"><label for="profile-bio">Bio</label><textarea id="profile-bio" name="bio" maxlength="10000">${escapeHtml(profile.bio)}</textarea></div><div class="field"><label for="profile-location">Location</label><input id="profile-location" name="location" maxlength="120" value="${escapeHtml(profile.location)}"></div><div class="field"><label for="profile-picture">Profile picture</label><input id="profile-picture" name="profile_picture" type="file" accept="image/*"><span class="field-help">Images up to 5 MB.</span></div><p class="form-error" aria-live="polite"></p><div class="form-actions"><button class="button button-primary" type="submit">Save profile</button></div></form>` : ""}</article><div class="section-heading profile-post-heading" id="profile-post-heading"><h2>Posts</h2><span class="result-note">${profile.post_count} shared ${profile.post_count === 1 ? "moment" : "moments"}</span></div><div id="profile-post-list">${renderPostList(state.profilePosts.items, state.profilePosts.next, "more-profile-posts", "Nothing shared yet", isOwn ? "Your posts will show up here. Head to the feed to share your first one." : "This member hasn’t shared a post yet.")}</div></section><aside class="profile-aside"><div class="rail-card profile-aside-card"><p class="rail-label">A LITTLE ABOUT</p><h3>${escapeHtml(profile.full_name || profile.username)}</h3><p>${profile.bio ? safeText(profile.bio) : "Every profile is the start of a new conversation."}</p>${profile.location ? `<span class="location-pill">⌖ ${escapeHtml(profile.location)}</span>` : ""}<a href="#/discover" class="text-link">Explore the community <span aria-hidden="true">→</span></a></div></aside></div>`;
}

function renderMain() {
  renderChrome();
  if (state.route.name === "feed") renderFeed();
  else if (state.route.name === "discover") renderDiscovery();
  else if (state.route.name === "profile") renderProfile();
  else renderAuthPage(state.route.name);
}

async function loadFeed(token) {
  page.innerHTML = `<div class="feed-layout"><section class="main-column"><div class="page-heading"><div><p class="eyebrow">YOUR COMMUNITY</p><h1>Home feed</h1></div></div>${loadingState("Finding the latest posts")}</section></div>`;
  try {
    const response = await api.get("/api/posts/");
    if (token !== state.routeVersion) return;
    state.feed = { items: response.results || [], next: response.next };
    renderMain();
    if (state.route.postId) {
      window.setTimeout(() => document.querySelector(`[data-post-card="${CSS.escape(state.route.postId)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    }
  } catch (error) {
    if (token !== state.routeVersion) return;
    page.innerHTML = errorState(error.message, "reload-route");
  }
}

function discoveryUrl(search = "") {
  const params = new URLSearchParams({ page_size: "20" });
  if (search) params.set("search", search);
  return `/api/profiles/?${params}`;
}

async function loadDiscovery(token, search = state.discovery.search) {
  page.innerHTML = `<div class="narrow-column"><div class="page-heading"><div><p class="eyebrow">FIND YOUR PEOPLE</p><h1>Discover</h1></div></div>${loadingState("Finding profiles")}</div>`;
  try {
    const response = await api.get(discoveryUrl(search));
    if (token !== state.routeVersion) return;
    state.discovery = { items: response.results || [], next: response.next, search };
    renderMain();
  } catch (error) {
    if (token !== state.routeVersion) return;
    page.innerHTML = errorState(error.message, "reload-route");
  }
}

async function loadProfile(token, username) {
  page.innerHTML = `<div class="profile-layout"><section class="main-column">${loadingState("Loading profile")}</section></div>`;
  try {
    const [profile, posts] = await Promise.all([
      api.get(`/api/profiles/${encodeURIComponent(username)}/`),
      api.get(`/api/profiles/${encodeURIComponent(username)}/posts/?page_size=20`),
    ]);
    if (token !== state.routeVersion) return;
    state.profile = profile;
    state.profilePosts = { items: posts.results || [], next: posts.next };
    state.profileAnimationPending = true;
    renderMain();
    state.profileAnimationPending = false;
  } catch (error) {
    if (token !== state.routeVersion) return;
    page.innerHTML = errorState(error.message, "reload-route");
  }
}

async function loadRoute() {
  state.route = currentRoute();
  const token = ++state.routeVersion;
  state.editingPostId = null;
  state.editingProfile = false;
  state.modal = null;
  modalRoot.innerHTML = "";
  renderChrome();

  if (state.route.name === "feed") return loadFeed(token);
  if (state.route.name === "discover") return loadDiscovery(token);
  if (state.route.name === "profile") {
    if (!state.route.username || state.route.username === "me") {
      if (!state.user) return navigate("login");
      state.route.username = state.user.username;
    }
    return loadProfile(token, state.route.username);
  }
  renderMain();
}

function setFormError(form, message) {
  const target = form.querySelector(".form-error");
  if (target) target.textContent = message;
}

function setFormBusy(form, busy, submitText) {
  const button = form.querySelector('[type="submit"]');
  if (!button) return;
  form.dataset.submitting = busy ? "true" : "false";
  button.disabled = busy;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.innerHTML = `<span class="spinner spinner-button" aria-hidden="true"></span> Please wait`;
  } else {
    button.textContent = submitText || button.dataset.originalText || "Submit";
    if (form.dataset.form === "create-post") updateComposerState(form);
  }
}

function updateComposerState(form) {
  const textarea = form.querySelector('textarea[name="content"]');
  const button = form.querySelector('[type="submit"]');
  const counter = form.querySelector("[data-character-count]");
  if (!textarea || !button || !counter) return;
  const length = textarea.value.length;
  counter.textContent = `${length.toLocaleString()} / 5,000`;
  counter.setAttribute("aria-label", `${length} of 5000 characters used`);
  counter.classList.toggle("near-limit", length >= 4500);
  button.disabled = !textarea.value.trim() || length > 5000 || form.dataset.submitting === "true";
}

async function submitForm(form) {
  const formType = form.dataset.form;
  setFormError(form, "");
  setFormBusy(form, true);
  try {
    if (formType === "login") {
      const data = new FormData(form);
      const response = await api.login({ username: data.get("username"), password: data.get("password") });
      state.user = response.user;
      await api.refreshCsrf();
      showToast(`Welcome back, ${response.user.username}.`);
      return navigate("feed");
    }
    if (formType === "register") {
      const data = new FormData(form);
      await api.register({
        username: data.get("username"),
        email: data.get("email"),
        password: data.get("password"),
        password_confirmation: data.get("password_confirmation"),
      });
      showToast("Your account is ready. Log in to join the conversation.");
      return navigate("login");
    }
    if (formType === "create-post") {
      const data = new FormData(form);
      const post = await api.post("/api/posts/", { content: data.get("content") });
      state.feed.items.unshift(post);
      state.editingPostId = null;
      showToast("Your post is live.");
      renderMain();
      return;
    }
    if (formType === "edit-post") {
      const postId = Number(form.dataset.postId);
      const data = new FormData(form);
      const updated = await api.patch(`/api/posts/${postId}/`, { content: data.get("content") });
      updatePostInLists(postId, () => updated);
      state.editingPostId = null;
      showToast("Post updated.");
      renderMain();
      return;
    }
    if (formType === "comment") {
      const postId = Number(form.dataset.postId);
      const data = new FormData(form);
      const created = await api.post(`/api/posts/${postId}/comments/`, { content: data.get("content") });
      const { comment_count: count, ...comment } = created;
      updatePostInLists(postId, (post) => ({ ...post, comment_count: count }));
      const comments = state.comments.get(postId) || { items: [], next: null };
      comments.items.push(comment);
      state.comments.set(postId, comments);
      showToast("Comment added.");
      renderMain();
      return;
    }
    if (formType === "edit-profile") {
      const data = new FormData(form);
      const payload = new FormData();
      payload.append("bio", data.get("bio") || "");
      payload.append("location", data.get("location") || "");
      const picture = form.querySelector('[name="profile_picture"]').files[0];
      if (picture) payload.append("profile_picture", picture);
      state.profile = await api.patchForm("/api/profiles/me/", payload);
      state.editingProfile = false;
      showToast("Profile updated.");
      renderMain();
      return;
    }
    if (formType === "discovery-search") {
      const data = new FormData(form);
      state.discovery.search = String(data.get("search") || "").trim();
      const token = ++state.routeVersion;
      await loadDiscovery(token, state.discovery.search);
    }
  } catch (error) {
    setFormError(form, error.message);
    showToast(error.message, "error");
  } finally {
    if (form.isConnected) setFormBusy(form, false);
  }
}

async function loadMoreFeed() {
  if (!state.feed.next) return;
  const button = document.querySelector('[data-action="more-feed"]');
  if (button) { button.disabled = true; button.textContent = "Loading…"; }
  try {
    const response = await api.get(state.feed.next);
    state.feed.items.push(...(response.results || []));
    state.feed.next = response.next;
    renderMain();
  } catch (error) {
    showToast(error.message, "error");
    if (button) { button.disabled = false; button.textContent = "Load more"; }
  }
}

async function loadMoreProfilePosts() {
  if (!state.profilePosts.next) return;
  const button = document.querySelector('[data-action="more-profile-posts"]');
  if (button) { button.disabled = true; button.textContent = "Loading…"; }
  try {
    const response = await api.get(state.profilePosts.next);
    state.profilePosts.items.push(...(response.results || []));
    state.profilePosts.next = response.next;
    renderMain();
  } catch (error) {
    showToast(error.message, "error");
    if (button) { button.disabled = false; button.textContent = "Load more"; }
  }
}

async function loadMoreDiscovery() {
  if (!state.discovery.next) return;
  const button = document.querySelector('[data-action="more-discovery"]');
  if (button) { button.disabled = true; button.textContent = "Loading…"; }
  try {
    const response = await api.get(state.discovery.next);
    state.discovery.items.push(...(response.results || []));
    state.discovery.next = response.next;
    renderMain();
  } catch (error) {
    showToast(error.message, "error");
    if (button) { button.disabled = false; button.textContent = "Load more people"; }
  }
}

async function toggleLike(button) {
  if (!state.user) {
    showToast("Log in to like posts.", "error");
    return navigate("login");
  }
  const postId = Number(button.dataset.postId);
  const post = [...state.feed.items, ...state.profilePosts.items].find((item) => item.id === postId);
  if (!post) return;
  const isLiking = !post.is_liked;
  button.disabled = true;
  try {
    const result = post.is_liked
      ? await api.delete(`/api/posts/${postId}/like/`)
      : await api.post(`/api/posts/${postId}/like/`);
    updatePostInLists(postId, (item) => ({ ...item, ...result }));
    renderMain();
    if (isLiking) {
      const heartButton = document.querySelector(`[data-action="toggle-like"][data-post-id="${postId}"]`);
      heartButton?.classList.add("like-success");
      window.setTimeout(() => heartButton?.classList.remove("like-success"), 420);
    }
  } catch (error) {
    button.disabled = false;
    showToast(error.message, "error");
  }
}

async function toggleComments(button) {
  const postId = Number(button.dataset.postId);
  if (state.openComments.has(postId)) {
    state.openComments.delete(postId);
    renderMain();
    return;
  }
  state.openComments.add(postId);
  state.comments.set(postId, { items: [], next: null, loading: true });
  renderMain();
  try {
    const response = await api.get(`/api/posts/${postId}/comments/`);
    state.comments.set(postId, { items: response.results || [], next: response.next, loading: false });
  } catch (error) {
    state.comments.set(postId, { items: [], next: null, loading: false, error: error.message });
  }
  renderMain();
}

async function loadMoreComments(postId) {
  const current = state.comments.get(postId);
  if (!current?.next) return;
  try {
    const response = await api.get(current.next);
    state.comments.set(postId, { items: [...(response.results || []), ...current.items], next: response.next, loading: false });
    renderMain();
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function deleteComment(button) {
  const commentId = Number(button.dataset.commentId);
  button.disabled = true;
  try {
    const response = await api.delete(`/api/comments/${commentId}/`);
    for (const [postId, comments] of state.comments) {
      const found = comments.items.some((comment) => comment.id === commentId);
      if (!found) continue;
      comments.items = comments.items.filter((comment) => comment.id !== commentId);
      state.comments.set(postId, comments);
      updatePostInLists(postId, (post) => ({ ...post, comment_count: response.comment_count }));
      break;
    }
    showToast("Comment deleted.");
    renderMain();
  } catch (error) {
    button.disabled = false;
    showToast(error.message, "error");
  }
}

async function toggleFollow(button) {
  if (!state.user) {
    showToast("Log in to follow people.", "error");
    return navigate("login");
  }
  const username = button.dataset.username;
  button.disabled = true;
  try {
    const isFollowing = button.classList.contains("is-following") || button.textContent.trim() === "Following";
    const profile = isFollowing
      ? await api.delete(`/api/profiles/${encodeURIComponent(username)}/follow/`)
      : await api.post(`/api/profiles/${encodeURIComponent(username)}/follow/`);
    if (state.profile?.username === username) state.profile = profile;
    state.discovery.items = state.discovery.items.map((item) => item.username === username ? profile : item);
    showToast(isFollowing ? `You unfollowed @${username}.` : `You’re now following @${username}.`);
    renderMain();
  } catch (error) {
    button.disabled = false;
    showToast(error.message, "error");
  }
}

async function logout() {
  const button = document.querySelector('[data-action="logout"]');
  if (button) { button.disabled = true; button.textContent = "Logging out…"; }
  try {
    await api.logout();
    state.user = null;
    state.feed.items = state.feed.items.map((post) => ({ ...post, is_liked: false }));
    await api.refreshCsrf();
    showToast("You’ve been logged out.");
    navigate("feed");
  } catch (error) {
    showToast(error.message, "error");
    if (button) { button.disabled = false; button.textContent = "Log out"; }
  }
}

async function showRelations(kind) {
  const profile = state.profile;
  if (!profile) return;
  if (kind === "posts") {
    document.getElementById("profile-post-heading")?.scrollIntoView({ behavior: "smooth" });
    return;
  }
  const relation = kind === "followers" ? "followers" : "following";
  const title = kind === "followers" ? "Followers" : "Following";
  state.modal = { profileUsername: profile.username, relation, title, items: [], next: null, error: "" };
  modalRoot.innerHTML = `<div class="modal-backdrop" data-action="close-modal"><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-heading"><h2 id="modal-title">${title}</h2><button class="icon-button" data-action="close-modal" type="button" aria-label="Close">×</button></div><div class="modal-content">${loadingState("Loading people")}</div></section></div>`;
  try {
    const response = await api.get(`/api/profiles/${encodeURIComponent(profile.username)}/${relation}/`);
    if (!state.modal) return;
    state.modal.items = response.results || [];
    state.modal.next = response.next;
    renderRelationsModal();
  } catch (error) {
    if (!state.modal) return;
    state.modal.error = error.message;
    renderRelationsModal();
  }
}

function renderRelationsModal() {
  if (!state.modal) return;
  const content = modalRoot.querySelector(".modal-content");
  if (!content) return;
  if (state.modal.error) {
    content.innerHTML = `<p class="inline-error">${escapeHtml(state.modal.error)}</p>`;
    return;
  }
  content.innerHTML = state.modal.items.length
    ? `${state.modal.items.map((person) => profileCard(person, false)).join("")}${state.modal.next ? `<div class="load-more-wrap"><button class="button button-secondary" data-action="more-relations" type="button">Load more</button></div>` : ""}`
    : `<p class="modal-empty">No ${state.modal.relation} yet.</p>`;
}

async function loadMoreRelations(button) {
  if (!state.modal?.next) return;
  button.disabled = true;
  button.textContent = "Loading…";
  try {
    const response = await api.get(state.modal.next);
    state.modal.items.push(...(response.results || []));
    state.modal.next = response.next;
    renderRelationsModal();
  } catch (error) {
    button.disabled = false;
    button.textContent = "Load more";
    showToast(error.message, "error");
  }
}

async function handleAction(button, event) {
  switch (button.dataset.action) {
    case "logout": return logout();
    case "reload-route": return loadRoute();
    case "more-feed": return loadMoreFeed();
    case "more-profile-posts": return loadMoreProfilePosts();
    case "more-discovery": return loadMoreDiscovery();
    case "more-comments": return loadMoreComments(Number(button.dataset.postId));
    case "more-relations": return loadMoreRelations(button);
    case "toggle-like": return toggleLike(button);
    case "toggle-comments": return toggleComments(button);
    case "delete-comment": return deleteComment(button);
    case "toggle-follow": return toggleFollow(button);
    case "open-profile": return navigate(`profile/${encodeURIComponent(button.dataset.username)}`);
    case "edit-post":
      state.editingPostId = Number(button.dataset.postId);
      return renderMain();
    case "cancel-edit":
      state.editingPostId = null;
      return renderMain();
    case "delete-post": {
      const postId = Number(button.dataset.postId);
      if (!window.confirm("Delete this post? This will also remove its comments and likes.")) return;
      button.disabled = true;
      try {
        await api.delete(`/api/posts/${postId}/`);
        removePostFromLists(postId);
        if (state.profile && state.profile.username === state.user?.username) {
          state.profile.post_count = Math.max(0, state.profile.post_count - 1);
        }
        showToast("Post deleted.");
        renderMain();
      } catch (error) {
        button.disabled = false;
        showToast(error.message, "error");
      }
      return;
    }
    case "toggle-profile-edit":
      state.editingProfile = !state.editingProfile;
      return renderMain();
    case "show-relations": return showRelations(button.dataset.kind);
    case "close-modal":
      if (button.classList.contains("modal-backdrop") && button !== event.target) return;
      modalRoot.innerHTML = "";
      return;
    case "copy-post-link": {
      const url = new URL(`${window.location.pathname}#/feed?post=${button.dataset.postId}`, window.location.origin);
      try {
        await navigator.clipboard.writeText(url.href);
        showToast("Post link copied.");
      } catch {
        showToast("Your browser couldn’t copy the link. You can copy it from the address bar.", "error");
      }
      return;
    }
    default: return;
  }
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  event.preventDefault();
  handleAction(button, event);
});

document.addEventListener("input", (event) => {
  const form = event.target.closest?.('form[data-form="create-post"]');
  if (form) updateComposerState(form);
});

document.addEventListener("submit", (event) => {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  submitForm(form);
});

document.addEventListener("error", (event) => {
  if (event.target instanceof HTMLImageElement && event.target.classList.contains("avatar") && !event.target.dataset.fallback) {
    event.target.dataset.fallback = "true";
    event.target.src = AVATAR_FALLBACK;
  }
}, true);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modalRoot.innerHTML) modalRoot.innerHTML = "";
});

window.addEventListener("hashchange", loadRoute);

async function start() {
  page.innerHTML = loadingState("Opening Connectly");
  try {
    await api.refreshCsrf();
    const response = await api.currentUser();
    state.user = response.is_authenticated ? response.user : null;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 403) {
      state.user = null;
    }
  }
  await loadRoute();
}

start();
