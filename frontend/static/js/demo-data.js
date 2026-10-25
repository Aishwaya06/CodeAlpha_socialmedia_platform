const STORAGE_KEY = "connectly.demo.v1";
const CURRENT_USER = "maya";
const MAX_POST_LENGTH = 5000;
const MAX_COMMENT_LENGTH = 2000;
const AVATAR_URL = new URL("../images/default-avatar.svg", import.meta.url).href;

const seedProfiles = () => [
  {
    username: "maya",
    full_name: "Maya Chen",
    bio: "Collecting little moments, good books, and better conversations.",
    location: "Portland, OR",
    profile_picture: AVATAR_URL,
    following: ["jordan"],
  },
  {
    username: "jordan",
    full_name: "Jordan Lee",
    bio: "Designer, weekend baker, and believer in small acts of kindness.",
    location: "Brooklyn, NY",
    profile_picture: AVATAR_URL,
    following: ["priya"],
  },
  {
    username: "priya",
    full_name: "Priya Nair",
    bio: "Finding new trails and new perspectives.",
    location: "Austin, TX",
    profile_picture: AVATAR_URL,
    following: ["maya"],
  },
  {
    username: "elliot",
    full_name: "Elliot Brooks",
    bio: "Making things with my hands and learning as I go.",
    location: "Seattle, WA",
    profile_picture: AVATAR_URL,
    following: ["maya", "jordan"],
  },
  {
    username: "sam",
    full_name: "Sam Rivera",
    bio: "Here for the stories, the street food, and the shared playlists.",
    location: "Chicago, IL",
    profile_picture: AVATAR_URL,
    following: ["priya"],
  },
];

function createInitialState() {
  const profiles = seedProfiles();
  const now = Date.now();
  return {
    version: 1,
    demoMode: true,
    nextPostId: 5,
    nextCommentId: 4,
    profiles,
    posts: [
      {
        id: 4,
        author_username: "maya",
        content: "A little reminder that it’s okay to take the scenic route. 🌿",
        created_at: new Date(now - 18 * 60 * 1000).toISOString(),
        liked_by: ["jordan", "priya"],
        comments: [],
      },
      {
        id: 3,
        author_username: "jordan",
        content: "Made a loaf of lemon-blueberry bread for the neighbors. The recipe said to let it cool first. The recipe was ignored.",
        created_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        liked_by: ["maya", "elliot", "sam"],
        comments: [
          {
            id: 3,
            author_username: "maya",
            content: "Warm bread is always worth the wait (or the lack of one).",
            created_at: new Date(now - 90 * 60 * 1000).toISOString(),
          },
        ],
      },
      {
        id: 2,
        author_username: "priya",
        content: "Found a quiet trail just outside the city this morning. Sharing the silence with kind people is its own kind of conversation.",
        created_at: new Date(now - 7 * 60 * 60 * 1000).toISOString(),
        liked_by: ["maya"],
        comments: [
          {
            id: 2,
            author_username: "sam",
            content: "Adding this to my weekend list!",
            created_at: new Date(now - 5 * 60 * 60 * 1000).toISOString(),
          },
        ],
      },
      {
        id: 1,
        author_username: "elliot",
        content: "What’s one small thing that made your day better? Mine was a stranger remembering my coffee order.",
        created_at: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
        liked_by: ["maya", "jordan"],
        comments: [
          {
            id: 1,
            author_username: "priya",
            content: "A sunny seat on the bus and a very good playlist.",
            created_at: new Date(now - 22 * 60 * 60 * 1000).toISOString(),
          },
        ],
      },
    ],
  };
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateState(value) {
  const profileNames = Array.isArray(value?.profiles)
    ? value.profiles.map((profile) => profile?.username)
    : [];
  return Boolean(
    value
      && value.version === 1
      && typeof value.demoMode === "boolean"
      && Number.isInteger(value.nextPostId)
      && Number.isInteger(value.nextCommentId)
      && Array.isArray(value.profiles)
      && value.profiles.some((profile) => profile?.username === CURRENT_USER)
      && value.profiles.every((profile) => (
        typeof profile?.username === "string"
        && typeof profile.full_name === "string"
        && typeof profile.bio === "string"
        && typeof profile.location === "string"
        && typeof profile.profile_picture === "string"
        && Array.isArray(profile.following)
        && profile.following.every((username) => profileNames.includes(username))
      ))
      && Array.isArray(value.posts)
      && value.posts.every((post) => (
        Number.isInteger(post?.id)
        && typeof post.author_username === "string"
        && profileNames.includes(post.author_username)
        && typeof post.content === "string"
        && typeof post.created_at === "string"
        && Array.isArray(post.liked_by)
        && post.liked_by.every((username) => profileNames.includes(username))
        && Array.isArray(post.comments)
        && post.comments.every((comment) => (
          Number.isInteger(comment?.id)
          && profileNames.includes(comment.author_username)
          && typeof comment.content === "string"
          && typeof comment.created_at === "string"
        ))
      )),
  );
}

let storageWarning = "";
let data;

function persist(next) {
  data = next;
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    storageWarning = "Browser storage is unavailable or full. Demo changes will last only until this tab is closed.";
  }
}

function initialize() {
  try {
    const stored = globalThis.localStorage.getItem(STORAGE_KEY);
    if (stored === null) {
      data = createInitialState();
      persist(data);
      return;
    }
    const parsed = JSON.parse(stored);
    if (!validateState(parsed)) throw new Error("Stored demo data has an unsupported shape.");
    data = parsed;
  } catch {
    storageWarning = "Saved demo data was invalid or browser storage is unavailable. A fresh in-memory demo is being used.";
    data = createInitialState();
    try {
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      storageWarning = "Saved demo data was invalid, so it was reset to the sample content.";
    } catch {
      storageWarning = "Browser storage is unavailable. Demo changes will last only until this tab is closed.";
    }
  }
}

function update(mutator) {
  const next = copy(data);
  const result = mutator(next);
  persist(next);
  return result;
}

function findProfile(source, username) {
  return source.profiles.find((profile) => profile.username === username) || null;
}

function publicProfile(source, profile) {
  if (!profile) return null;
  const followers = source.profiles
    .filter((person) => person.following.includes(profile.username))
    .map((person) => person.username);
  const viewer = source.demoMode ? CURRENT_USER : null;
  return {
    username: profile.username,
    full_name: profile.full_name,
    bio: profile.bio,
    location: profile.location,
    profile_picture: profile.profile_picture,
    post_count: source.posts.filter((post) => post.author_username === profile.username).length,
    follower_count: followers.length,
    following_count: profile.following.length,
    is_following: Boolean(viewer && profile.username !== viewer && findProfile(source, viewer)?.following.includes(profile.username)),
  };
}

function publicPost(source, post) {
  const author = publicProfile(source, findProfile(source, post.author_username));
  return {
    id: post.id,
    author: {
      username: author.username,
      full_name: author.full_name,
      profile_picture: author.profile_picture,
    },
    content: post.content,
    created_at: post.created_at,
    like_count: post.liked_by.length,
    is_liked: Boolean(source.demoMode && post.liked_by.includes(CURRENT_USER)),
    comment_count: post.comments.length,
  };
}

function publicComment(source, comment) {
  const author = publicProfile(source, findProfile(source, comment.author_username));
  return {
    id: comment.id,
    author: {
      username: author.username,
      full_name: author.full_name,
      profile_picture: author.profile_picture,
    },
    content: comment.content,
    created_at: comment.created_at,
  };
}

function requireDemoMode(source = data) {
  if (!source.demoMode) throw new Error("Enter demo mode to use social features.");
}

function requireContent(value, maximum, label) {
  const content = String(value ?? "").trim();
  if (!content) throw new Error(`${label} cannot be empty.`);
  if (content.length > maximum) throw new Error(`${label} must be ${maximum.toLocaleString()} characters or fewer.`);
  return content;
}

initialize();

export const demoData = {
  getStorageWarning: () => storageWarning,
  isDemoMode: () => data.demoMode,
  getCurrentUser: () => data.demoMode ? publicProfile(data, findProfile(data, CURRENT_USER)) : null,
  getPosts: () => data.posts.map((post) => publicPost(data, post)),
  getProfile(username) {
    const profile = findProfile(data, username);
    return profile ? publicProfile(data, profile) : null;
  },
  getProfiles(search = "") {
    const query = String(search).trim().toLocaleLowerCase();
    return data.profiles
      .filter((profile) => profile.username !== CURRENT_USER)
      .filter((profile) => !query || `${profile.username} ${profile.full_name} ${profile.bio}`.toLocaleLowerCase().includes(query))
      .map((profile) => publicProfile(data, profile));
  },
  getProfilePosts(username) {
    return data.posts
      .filter((post) => post.author_username === username)
      .map((post) => publicPost(data, post));
  },
  getComments(postId) {
    const post = data.posts.find((item) => item.id === Number(postId));
    return post ? post.comments.map((comment) => publicComment(data, comment)) : [];
  },
  getRelations(username, relation) {
    const profile = findProfile(data, username);
    if (!profile) return [];
    const names = relation === "followers"
      ? data.profiles.filter((person) => person.following.includes(username)).map((person) => person.username)
      : profile.following;
    return names.map((name) => publicProfile(data, findProfile(data, name))).filter(Boolean);
  },
  createPost(content) {
    requireDemoMode();
    const text = requireContent(content, MAX_POST_LENGTH, "Post");
    return update((next) => {
      const post = {
        id: next.nextPostId++,
        author_username: CURRENT_USER,
        content: text,
        created_at: new Date().toISOString(),
        liked_by: [],
        comments: [],
      };
      next.posts.unshift(post);
      return publicPost(next, post);
    });
  },
  updatePost(postId, content) {
    requireDemoMode();
    const text = requireContent(content, MAX_POST_LENGTH, "Post");
    return update((next) => {
      const post = next.posts.find((item) => item.id === Number(postId) && item.author_username === CURRENT_USER);
      if (!post) throw new Error("That post could not be found.");
      post.content = text;
      return publicPost(next, post);
    });
  },
  deletePost(postId) {
    requireDemoMode();
    update((next) => {
      const index = next.posts.findIndex((item) => item.id === Number(postId) && item.author_username === CURRENT_USER);
      if (index < 0) throw new Error("That post could not be found.");
      next.posts.splice(index, 1);
    });
  },
  toggleLike(postId) {
    requireDemoMode();
    return update((next) => {
      const post = next.posts.find((item) => item.id === Number(postId));
      if (!post) throw new Error("That post could not be found.");
      const liked = post.liked_by.includes(CURRENT_USER);
      post.liked_by = liked
        ? post.liked_by.filter((username) => username !== CURRENT_USER)
        : [...post.liked_by, CURRENT_USER];
      return publicPost(next, post);
    });
  },
  addComment(postId, content) {
    requireDemoMode();
    const text = requireContent(content, MAX_COMMENT_LENGTH, "Comment");
    return update((next) => {
      const post = next.posts.find((item) => item.id === Number(postId));
      if (!post) throw new Error("That post could not be found.");
      const comment = {
        id: next.nextCommentId++,
        author_username: CURRENT_USER,
        content: text,
        created_at: new Date().toISOString(),
      };
      post.comments.push(comment);
      return { ...publicComment(next, comment), comment_count: post.comments.length };
    });
  },
  deleteComment(commentId) {
    requireDemoMode();
    return update((next) => {
      const post = next.posts.find((item) => item.comments.some((comment) => comment.id === Number(commentId)));
      const index = post?.comments.findIndex((comment) => comment.id === Number(commentId) && comment.author_username === CURRENT_USER);
      if (!post || index < 0) throw new Error("That comment could not be found or deleted.");
      post.comments.splice(index, 1);
      return { postId: post.id, comment_count: post.comments.length };
    });
  },
  toggleFollow(username) {
    requireDemoMode();
    if (username === CURRENT_USER) throw new Error("You cannot follow your own profile.");
    return update((next) => {
      const viewer = findProfile(next, CURRENT_USER);
      const target = findProfile(next, username);
      if (!target) throw new Error("That profile could not be found.");
      viewer.following = viewer.following.includes(username)
        ? viewer.following.filter((name) => name !== username)
        : [...viewer.following, username];
      return publicProfile(next, target);
    });
  },
  updateProfile({ bio, location, profile_picture }) {
    requireDemoMode();
    return update((next) => {
      const profile = findProfile(next, CURRENT_USER);
      profile.bio = String(bio ?? "").trim();
      profile.location = String(location ?? "").trim();
      if (profile_picture) profile.profile_picture = profile_picture;
      return publicProfile(next, profile);
    });
  },
  enterDemo() {
    return update((next) => { next.demoMode = true; });
  },
  exitDemo() {
    return update((next) => { next.demoMode = false; });
  },
  reset() {
    data = createInitialState();
    persist(data);
  },
};

export class DemoDataError extends Error {
  constructor(message) {
    super(message);
    this.name = "DemoDataError";
  }
}
