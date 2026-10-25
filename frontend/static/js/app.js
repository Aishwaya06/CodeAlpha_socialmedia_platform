import { demoData } from "./demo-data.js";

const CURRENT_DEMO_USERNAME = "maya";
const AVATAR_FALLBACK = new URL("../images/default-avatar.svg", import.meta.url).href;
const state = {
  user: demoData.getCurrentUser(),
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
  storageWarningShown: false,
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
  return state.user ? demoData.getProfile(state.user.username)?.profile_picture || AVATAR_FALLBACK : AVATAR_FALLBACK;
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
          <span class="demo-label">DEMO</span>
          <button class="button button-quiet button-small" data-action="reset-demo" type="button" aria-label="Reset demo data">Reset</button>
          <button class="button button-quiet button-small" data-action="exit-demo" type="button">Exit demo</button>
        ` : `
          <button class="button button-primary button-small" data-action="enter-demo" type="button">Try demo</button>
          <a class="button button-quiet button-small" href="#/login">About sign-in</a>
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
    <div class="rail-note"><span class="note-spark">✦</span><strong>Good conversations start with a hello.</strong><span>Find your people and share what’s on your mind.</span></div>
    ${state.user ? `<section class="rail-card demo-card"><p class="rail-label">DEMONSTRATION ACCOUNT</p><strong>@${escapeHtml(state.user.username)}</strong><p>Changes are saved only in this browser. Demo mode is not secure authentication.</p></section>` : ""}`;

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
      ${state.user ? `<form class="comment-form" data-form="comment" data-post-id="${post.id}"><label class="sr-only" for="comment-${post.id}">Write a comment</label><input id="comment-${post.id}" name="content" maxlength="2000" placeholder="Write a comment…" required><button class="button button-primary button-small" type="submit">Send</button><p class="form-error" aria-live="polite"></p></form>` : `<p class="comments-signin"><button class="text-button" data-action="enter-demo" type="button">Enter demo mode</button> to join the conversation.</p>`}
    </section>` : ""}
  </article>`;
}

function renderPostList(posts, next, moreAction, emptyTitle, emptyMessage) {
  if (!posts.length) return emptyState(emptyTitle, emptyMessage);
  return `${posts.map(postMarkup).join("")}${next ? `<div class="load-more-wrap"><button class="button button-secondary" type="button" data-action="${moreAction}">Load more</button></div>` : ""}`;
}

function renderComposer() {
  if (!state.user) {
    return `<section class="composer-card guest-composer"><div class="composer-greeting"><span class="compose-icon">✦</span><div><strong>Your voice belongs here.</strong><p>Enter demo mode to post, react, and join the conversation.</p></div></div><div class="guest-actions"><button class="button button-primary" data-action="enter-demo" type="button">Try demo mode</button><a class="button button-quiet" href="#/login">About sign-in</a></div></section>`;
  }
  return `<form class="composer-card" data-form="create-post"><div class="composer-top">${avatar(currentAvatar(), state.user.username, "avatar-medium")}<label class="sr-only" for="new-post">What’s on your mind?</label><textarea id="new-post" name="content" maxlength="5000" aria-describedby="post-character-count" placeholder="What’s on your mind, @${escapeHtml(state.user.username)}?" required></textarea></div><div class="composer-bottom"><div class="composer-meta"><span class="composer-hint">A little kindness goes a long way.</span><output class="character-count" id="post-character-count" data-character-count aria-label="0 of 5000 characters used">0 / 5,000</output></div><div class="composer-actions"><p class="form-error" aria-live="polite"></p><button class="button button-primary" type="submit" disabled><span aria-hidden="true">＋</span> Share post</button></div></div></form>`;
}

function renderFeed() {
  page.innerHTML = `<div class="feed-layout"><section class="main-column"><div class="page-heading"><div><p class="eyebrow">YOUR COMMUNITY</p><h1>Home feed</h1><p class="page-subtitle">The latest from people on Connectly.</p></div><span class="heading-spark" aria-hidden="true">✦</span></div>${renderComposer()}<div class="section-heading"><h2>Latest posts</h2><span class="live-label"><i></i> Demo feed</span></div><div id="post-list">${renderPostList(state.feed.items, state.feed.next, "more-feed", "A quiet moment", "There are no posts here yet. Be the first to start a conversation.")}</div></section><aside class="feed-aside"><div class="aside-art"><div class="art-orbit orbit-one"></div><div class="art-orbit orbit-two"></div><div class="art-center">c</div><span class="art-star star-one">✦</span><span class="art-star star-two">✳</span><span class="art-dot"></span></div><p class="aside-kicker">A little closer</p><h2>Community is built one post at a time.</h2><p>Share your perspective and make room for someone else’s.</p><a href="#/discover" class="text-link">Find new voices <span aria-hidden="true">→</span></a></aside></div>`;
}

function renderAuthPage(mode) {
  const registration = mode === "register";
  page.innerHTML = `<div class="auth-layout"><section class="auth-promo"><a class="brand brand-light" href="#/feed"><span class="brand-mark">c</span><span>connectly</span></a><div class="promo-copy"><span class="promo-spark">✦</span><p class="eyebrow">A SOCIAL SPACE THAT FEELS LIKE YOURS</p><h1>Good things happen when we <em>connect.</em></h1><p>Find your people, share your everyday, and make the internet feel a little more human.</p></div><div class="promo-bottom"><span>Here for the little moments.</span><span class="promo-decoration">✳</span></div></section><section class="auth-panel"><div class="auth-form-wrap"><div class="mobile-auth-brand"><a class="brand" href="#/feed"><span class="brand-mark">c</span><span>connectly</span></a></div><p class="eyebrow">${registration ? "DEMO EXPERIENCE" : "SERVER SIGN-IN UNAVAILABLE"}</p><h2>${registration ? "Try Connectly locally" : "Sign-in needs a backend"}</h2><p class="auth-subtitle">This static GitHub Pages demo has no deployed Django server. No password is needed or saved; demo mode is not secure authentication.</p><section class="demo-auth-notice"><strong>What works here</strong><p>Use the demonstration account <b>@maya</b> to explore profiles, posts, likes, follows, and comments. Changes are saved in this browser only.</p><p>Real accounts and secure sign-in require the Django backend to be deployed.</p></section><button class="button button-primary button-wide" data-action="enter-demo" type="button">Enter demo as @maya <span aria-hidden="true">→</span></button><p class="auth-switch"><a href="#/feed">Return to the home feed</a></p><p class="auth-terms">Demo mode is for exploration only and does not provide identity verification or account security.</p></div></section></div>`;
}

function profileCard(profile, includeFollow = true) {
  const following = profile.is_following;
  return `<article class="person-card"><button class="person-main" type="button" data-action="open-profile" data-username="${escapeHtml(profile.username)}">${avatar(profile.profile_picture, profile.username, "avatar-large")}<span class="person-copy"><strong>${escapeHtml(profile.full_name || `@${profile.username}`)}</strong><span>@${escapeHtml(profile.username)}</span>${profile.bio ? `<small>${safeText(profile.bio)}</small>` : ""}</span></button><div class="person-stats"><span><strong>${profile.post_count}</strong> posts</span><span><strong>${profile.follower_count}</strong> followers</span></div>${includeFollow ? (state.user ? `<button class="button ${following ? "button-secondary is-following" : "button-primary"} follow-button" data-action="toggle-follow" data-username="${escapeHtml(profile.username)}" type="button">${following ? "Following" : "Follow"}</button>` : `<button class="button button-secondary follow-button" data-action="enter-demo" type="button">Follow</button>`) : ""}</article>`;
}

function renderDiscovery() {
  page.innerHTML = `<div class="narrow-column"><div class="page-heading discovery-heading"><div><p class="eyebrow">FIND YOUR PEOPLE</p><h1>Discover</h1><p class="page-subtitle">Good conversations can start anywhere.</p></div><span class="heading-spark" aria-hidden="true">✦</span></div><form class="search-form" data-form="discovery-search"><label class="sr-only" for="people-search">Search usernames</label><span aria-hidden="true">⌕</span><input id="people-search" name="search" value="${escapeHtml(state.discovery.search)}" placeholder="Search by username"><button class="button button-primary" type="submit">Search</button></form><div class="section-heading"><h2>${state.discovery.search ? `Results for “${escapeHtml(state.discovery.search)}”` : "People to know"}</h2><span class="result-note">${state.discovery.items.length ? "Sample profiles" : ""}</span></div><div id="people-list">${state.discovery.items.length ? `${state.discovery.items.map((person) => profileCard(person)).join("")}${state.discovery.next ? `<div class="load-more-wrap"><button class="button button-secondary" data-action="more-discovery" type="button">Load more people</button></div>` : ""}` : emptyState("No profiles found", state.discovery.search ? "Try a different name or username." : "There aren’t any profiles to show yet. Check back soon.")}</div></div>`;
}

function renderStats(profile) {
  return `<div class="profile-stats"><button type="button" data-action="show-relations" data-kind="posts"><strong>${profile.post_count}</strong><span>posts</span></button><button type="button" data-action="show-relations" data-kind="followers"><strong>${profile.follower_count}</strong><span>followers</span></button><button type="button" data-action="show-relations" data-kind="following"><strong>${profile.following_count}</strong><span>following</span></button></div>`;
}

function renderProfile() {
  const profile = state.profile;
  const isOwn = state.user && profile.username === state.user.username;
  page.innerHTML = `<div class="profile-layout"><section class="main-column"><article class="profile-card ${state.profileAnimationPending ? "profile-enter" : ""}"><div class="profile-cover"><span class="cover-orb cover-orb-one"></span><span class="cover-orb cover-orb-two"></span><span class="cover-spark">✦</span></div><div class="profile-overview">${avatar(profile.profile_picture, profile.username, "profile-avatar")}<div class="profile-primary"><div class="profile-name-row"><div><p class="eyebrow">CONNECTLY MEMBER</p><h1>${escapeHtml(profile.full_name || profile.username)}</h1><p class="profile-handle">@${escapeHtml(profile.username)}</p></div>  ${isOwn ? `<button class="button button-secondary" type="button" data-action="toggle-profile-edit">${state.editingProfile ? "Cancel edit" : "Edit profile"}</button>` : state.user ? `<button class="button ${profile.is_following ? "button-secondary is-following" : "button-primary"}" type="button" data-action="toggle-follow" data-username="${escapeHtml(profile.username)}">${profile.is_following ? "Following" : "Follow"}</button>` : `<button class="button button-primary" data-action="enter-demo" type="button">Follow</button>`}</div>${profile.bio ? `<p class="profile-bio">${safeText(profile.bio)}</p>` : `<p class="profile-bio profile-bio-empty">${isOwn ? "Add a little about yourself to make your profile your own." : "This member hasn’t added a bio yet."}</p>`}${profile.location ? `<p class="profile-location"><span aria-hidden="true">⌖</span>${escapeHtml(profile.location)}</p>` : ""}${renderStats(profile)}</div></div>
      ${isOwn && state.editingProfile ? `<form class="profile-edit-form" data-form="edit-profile"><div class="field"><label for="profile-bio">Bio</label><textarea id="profile-bio" name="bio" maxlength="10000">${escapeHtml(profile.bio)}</textarea></div><div class="field"><label for="profile-location">Location</label><input id="profile-location" name="location" maxlength="120" value="${escapeHtml(profile.location)}"></div><div class="field"><label for="profile-picture">Profile picture</label><input id="profile-picture" name="profile_picture" type="file" accept="image/*"><span class="field-help">Images smaller than 300 KB are stored in this browser.</span></div><p class="form-error" aria-live="polite"></p><div class="form-actions"><button class="button button-primary" type="submit">Save profile</button></div></form>` : ""}</article><div class="section-heading profile-post-heading" id="profile-post-heading"><h2>Posts</h2><span class="result-note">${profile.post_count} shared ${profile.post_count === 1 ? "moment" : "moments"}</span></div><div id="profile-post-list">${renderPostList(state.profilePosts.items, state.profilePosts.next, "more-profile-posts", "Nothing shared yet", isOwn ? "Your posts will show up here. Head to the feed to share your first one." : "This member hasn’t shared a post yet.")}</div></section><aside class="profile-aside"><div class="rail-card profile-aside-card"><p class="rail-label">A LITTLE ABOUT</p><h3>${escapeHtml(profile.full_name || profile.username)}</h3><p>${profile.bio ? safeText(profile.bio) : "Every profile is the start of a new conversation."}</p>${profile.location ? `<span class="location-pill">⌖ ${escapeHtml(profile.location)}</span>` : ""}<a href="#/discover" class="text-link">Explore the community <span aria-hidden="true">→</span></a></div></aside></div>`;
}

function renderMain() {
  renderChrome();
  if (state.route.name === "feed") renderFeed();
  else if (state.route.name === "discover") renderDiscovery();
  else if (state.route.name === "profile") renderProfile();
  else renderAuthPage(state.route.name);
}

function loadFeed(token) {
  if (token !== state.routeVersion) return;
  state.feed = { items: demoData.getPosts(), next: null };
  renderMain();
  if (state.route.postId) {
    window.setTimeout(() => document.querySelector(`[data-post-card="${CSS.escape(state.route.postId)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }
}

function loadDiscovery(token, search = state.discovery.search) {
  if (token !== state.routeVersion) return;
  state.discovery = { items: demoData.getProfiles(search), next: null, search };
  renderMain();
}

function loadProfile(token, username) {
  if (token !== state.routeVersion) return;
  state.profile = demoData.getProfile(username);
  if (!state.profile) {
    page.innerHTML = emptyState("Profile not found", "This sample profile is not available.", "Explore people", "#/discover");
    return;
  }
  state.profilePosts = { items: demoData.getProfilePosts(username), next: null };
  state.profileAnimationPending = true;
  renderMain();
  state.profileAnimationPending = false;
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
    if (formType === "create-post") {
      const data = new FormData(form);
      const post = demoData.createPost(data.get("content"));
      state.feed.items.unshift(post);
      if (state.profile?.username === state.user.username) state.profilePosts.items.unshift(post);
      state.profile = demoData.getProfile(state.user.username);
      notifyStorageWarning();
      showToast("Your post is live.");
      renderMain();
      return;
    }
    if (formType === "edit-post") {
      const postId = Number(form.dataset.postId);
      const data = new FormData(form);
      const updated = demoData.updatePost(postId, data.get("content"));
      updatePostInLists(postId, () => updated);
      notifyStorageWarning();
      state.editingPostId = null;
      showToast("Post updated.");
      renderMain();
      return;
    }
    if (formType === "comment") {
      const postId = Number(form.dataset.postId);
      const data = new FormData(form);
      const created = demoData.addComment(postId, data.get("content"));
      const { comment_count: count, ...comment } = created;
      updatePostInLists(postId, (post) => ({ ...post, comment_count: count }));
      const comments = state.comments.get(postId) || { items: [], next: null };
      comments.items.push(comment);
      state.comments.set(postId, comments);
      notifyStorageWarning();
      showToast("Comment added.");
      renderMain();
      return;
    }
    if (formType === "edit-profile") {
      const data = new FormData(form);
      const picture = form.querySelector('[name="profile_picture"]').files[0];
      let profilePicture;
      if (picture) {
        if (!picture.type.startsWith("image/")) throw new Error("Choose a valid image file.");
        if (picture.size > 300 * 1024) throw new Error("Choose an image smaller than 300 KB to keep demo storage available.");
        profilePicture = await readImageAsDataUrl(picture);
      }
      state.profile = demoData.updateProfile({
        bio: data.get("bio") || "",
        location: data.get("location") || "",
        profile_picture: profilePicture,
      });
      state.user = demoData.getCurrentUser();
      for (const list of [state.feed.items, state.profilePosts.items]) {
        for (const post of list) {
          if (post.author.username === state.user.username) {
            post.author = {
              ...post.author,
              full_name: state.user.full_name,
              profile_picture: state.user.profile_picture,
            };
          }
        }
      }
      notifyStorageWarning();
      state.editingProfile = false;
      showToast("Profile updated.");
      renderMain();
      return;
    }
    if (formType === "discovery-search") {
      const data = new FormData(form);
      state.discovery.search = String(data.get("search") || "").trim();
      state.discovery.items = demoData.getProfiles(state.discovery.search);
      state.discovery.next = null;
      renderMain();
    }
  } catch (error) {
    setFormError(form, error.message);
    showToast(error.message, "error");
  } finally {
    if (form.isConnected) setFormBusy(form, false);
  }
}

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") reject(new Error("The selected image could not be read."));
      else resolve(reader.result);
    });
    reader.addEventListener("error", () => reject(new Error("The selected image could not be read.")));
    reader.readAsDataURL(file);
  });
}

function notifyStorageWarning() {
  const warning = demoData.getStorageWarning();
  if (warning && !state.storageWarningShown) {
    state.storageWarningShown = true;
    showToast(warning, "error");
  }
}

async function toggleLike(button) {
  if (!state.user) {
    showToast("Enter demo mode to like posts.", "error");
    return;
  }
  const postId = Number(button.dataset.postId);
  const post = [...state.feed.items, ...state.profilePosts.items].find((item) => item.id === postId);
  if (!post) return;
  const isLiking = !post.is_liked;
  try {
    const updated = demoData.toggleLike(postId);
    updatePostInLists(postId, () => updated);
    notifyStorageWarning();
    renderMain();
    if (isLiking) {
      const heartButton = document.querySelector(`[data-action="toggle-like"][data-post-id="${postId}"]`);
      heartButton?.classList.add("like-success");
      window.setTimeout(() => heartButton?.classList.remove("like-success"), 420);
    }
  } catch (error) {
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
  state.comments.set(postId, { items: demoData.getComments(postId), next: null, loading: false });
  renderMain();
}

async function deleteComment(button) {
  const commentId = Number(button.dataset.commentId);
  try {
    const response = demoData.deleteComment(commentId);
    const comments = state.comments.get(response.postId);
    if (comments) comments.items = comments.items.filter((comment) => comment.id !== commentId);
    updatePostInLists(response.postId, (post) => ({ ...post, comment_count: response.comment_count }));
    notifyStorageWarning();
    showToast("Comment deleted.");
    renderMain();
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function toggleFollow(button) {
  if (!state.user) {
    showToast("Enter demo mode to follow people.", "error");
    return;
  }
  const username = button.dataset.username;
  try {
    const isFollowing = button.classList.contains("is-following") || button.textContent.trim() === "Following";
    demoData.toggleFollow(username);
    state.discovery.items = demoData.getProfiles(state.discovery.search);
    if (state.profile?.username === username) state.profile = demoData.getProfile(username);
    if (state.profile?.username === state.user.username) state.profile = demoData.getProfile(state.user.username);
    notifyStorageWarning();
    showToast(isFollowing ? `You unfollowed @${username}.` : `You’re now following @${username}.`);
    renderMain();
  } catch (error) {
    showToast(error.message, "error");
  }
}

function enterDemo() {
  demoData.enterDemo();
  state.user = demoData.getCurrentUser();
  notifyStorageWarning();
  showToast("You’re exploring as @maya. This is a local demo account.");
  navigate("feed");
}

function exitDemo() {
  demoData.exitDemo();
  state.user = null;
  state.feed.items = demoData.getPosts();
  state.discovery.items = demoData.getProfiles(state.discovery.search);
  notifyStorageWarning();
  showToast("You left demo mode. The feed remains available to browse.");
  if (state.route.name === "profile" && state.route.username === CURRENT_DEMO_USERNAME) navigate("login");
  else loadRoute();
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
  state.modal = { profileUsername: profile.username, relation, title, items: demoData.getRelations(profile.username, relation), next: null, error: "" };
  modalRoot.innerHTML = `<div class="modal-backdrop" data-action="close-modal"><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-heading"><h2 id="modal-title">${title}</h2><button class="icon-button" data-action="close-modal" type="button" aria-label="Close">×</button></div><div class="modal-content"></div></section></div>`;
  renderRelationsModal();
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

async function handleAction(button, event) {
  switch (button.dataset.action) {
    case "enter-demo": return enterDemo();
    case "exit-demo": return exitDemo();
    case "reset-demo":
      if (!window.confirm("Reset posts, likes, comments, follows, and profile edits to the original sample data?")) return;
      demoData.reset();
      state.user = demoData.getCurrentUser();
      state.feed = { items: demoData.getPosts(), next: null };
      state.discovery = { items: demoData.getProfiles(), next: null, search: "" };
      state.profile = null;
      state.profilePosts = { items: [], next: null };
      state.comments.clear();
      state.storageWarningShown = false;
      notifyStorageWarning();
      showToast("Demo data has been reset.");
      return loadRoute();
    case "reload-route": return loadRoute();
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
      try {
        demoData.deletePost(postId);
        removePostFromLists(postId);
        for (const id of state.comments.keys()) {
          if (id === postId) state.comments.delete(id);
        }
        if (state.profile) state.profile = demoData.getProfile(state.profile.username);
        notifyStorageWarning();
        showToast("Post deleted.");
        renderMain();
      } catch (error) {
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
  handleAction(button, event).catch((error) => {
    console.error("Connectly action failed.", error);
    showToast("Something unexpected happened. Please try again.", "error");
  });
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

function start() {
  notifyStorageWarning();
  loadRoute();
}

start();
