import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { hashPassword } from "./auth.js";
import { id, now } from "./utils.js";

const initialState = () => ({
  clients: [],
  posts: [],
  media: [],
  shareLinks: [],
  users: [],
  memberships: [],
  activity: [],
  updatedAt: now()
});

const ALWAYS_ADMIN_EMAILS = new Set(["zac@hommemade.xyz"]);
const PROFILE_SETTING_KEYS = new Set([
  "handle",
  "displayName",
  "avatarUrl",
  "followers",
  "following",
  "likes",
  "bio",
  "linkText",
  "linkUrl"
]);

function sanitizeClientProfileSettings(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const limits = {
    handle: 80,
    displayName: 120,
    avatarUrl: 500,
    followers: 50,
    following: 50,
    likes: 50,
    bio: 400,
    linkText: 120,
    linkUrl: 500
  };
  const next = {};
  for (const [key, value] of Object.entries(input)) {
    if (!PROFILE_SETTING_KEYS.has(key)) continue;
    if (value === undefined || value === null) continue;
    const str = String(value).trim().slice(0, limits[key] || 200);
    next[key] = str;
  }
  return next;
}

function applyRolePromotions(state) {
  let changed = false;
  state.users = state.users.map((user) => {
    const email = String(user?.email || "").trim().toLowerCase();
    if (!ALWAYS_ADMIN_EMAILS.has(email)) return user;
    if (user.role === "owner_admin") return user;
    changed = true;
    return { ...user, role: "owner_admin", updatedAt: now() };
  });
  return changed;
}

function ensureStateShape(value) {
  const state = { ...initialState(), ...(value || {}) };
  if (!Array.isArray(state.clients)) state.clients = [];
  state.clients = state.clients.map((client) => ({
    ...client,
    profileSettings: sanitizeClientProfileSettings(client?.profileSettings || {})
  }));
  if (!Array.isArray(state.posts)) state.posts = [];
  if (!Array.isArray(state.media)) state.media = [];
  if (!Array.isArray(state.shareLinks)) state.shareLinks = [];
  if (!Array.isArray(state.users)) state.users = [];
  if (!Array.isArray(state.memberships)) state.memberships = [];
  if (!Array.isArray(state.activity)) state.activity = [];

  if (!state.users.length) {
    state.users = [{
      id: "owner-admin",
      email: config.adminEmail,
      name: "Owner",
      role: "owner_admin",
      passwordHash: hashPassword(config.adminPassword),
      disabledAt: "",
      createdAt: now(),
      updatedAt: now()
    }];
  }

  applyRolePromotions(state);

  return state;
}

async function ensureDataFile() {
  await fs.mkdir(path.dirname(config.dataFile), { recursive: true });
  try {
    await fs.access(config.dataFile);
  } catch {
    await fs.writeFile(config.dataFile, JSON.stringify(initialState(), null, 2));
  }
}

export async function loadState() {
  await ensureDataFile();
  try {
    const raw = await fs.readFile(config.dataFile, "utf8");
    return ensureStateShape(JSON.parse(raw));
  } catch {
    return ensureStateShape(initialState());
  }
}

// Serialize all read-modify-write operations so concurrent requests
// never read stale state and overwrite each other's changes.
let dbQueue = Promise.resolve();

function enqueue(fn) {
  const next = dbQueue.then(() => fn());
  dbQueue = next.catch(() => {}); // don't let one failure stall the queue
  return next;
}

async function saveState(state) {
  const next = { ...ensureStateShape(state), updatedAt: now() };
  const tmp = config.dataFile + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(next, null, 2));
  await fs.rename(tmp, config.dataFile); // atomic on Linux (same filesystem)
  return next;
}

function mediaFileNameFromUrlPath(urlPath = "") {
  return path.basename(String(urlPath || "").split("?")[0] || "");
}

async function cleanupMediaFiles(records = []) {
  for (const record of records) {
    const fileName = mediaFileNameFromUrlPath(record?.urlPath);
    if (!fileName) continue;
    const absolute = path.resolve(config.uploadDir, fileName);
    try {
      await fs.unlink(absolute);
    } catch {
      // best-effort cleanup; ignore missing files and continue
    }
  }
}

export function upsertClient(patch) {
  return enqueue(async () => {
    const state = await loadState();
    const existing = state.clients.find((c) => c.id === patch.id);
    const mergedProfileSettings = sanitizeClientProfileSettings({
      ...(existing?.profileSettings || {}),
      ...((patch && typeof patch.profileSettings === "object" && !Array.isArray(patch.profileSettings)) ? patch.profileSettings : {})
    });
    const client = existing
      ? { ...existing, ...patch, profileSettings: mergedProfileSettings, updatedAt: now() }
      : {
          id: patch.id || id(),
          name: patch.name || "Client",
          channels: Array.isArray(patch.channels) && patch.channels.length ? patch.channels : ["Instagram"],
          shareSlug: patch.shareSlug || String(patch.name || "client").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          sharingEnabled: patch.sharingEnabled !== false,
          profileSettings: mergedProfileSettings,
          createdAt: now(),
          updatedAt: now()
        };
    state.clients = existing ? state.clients.map((c) => (c.id === client.id ? client : c)) : [client, ...state.clients];
    await saveState(state);
    return client;
  });
}

export function upsertPost(patch) {
  return enqueue(async () => {
    const state = await loadState();
    const existing = state.posts.find((p) => p.id === patch.id);
    const post = existing
      ? { ...existing, ...patch, updatedAt: now() }
      : {
          id: patch.id || id(),
          clientId: patch.clientId || "",
          title: patch.title || "Untitled Post",
          caption: patch.caption || "",
          tags: Array.isArray(patch.tags) ? patch.tags : [],
          platforms: Array.isArray(patch.platforms) && patch.platforms.length ? patch.platforms : ["Instagram"],
          status: patch.status || "idea",
          visibility: patch.visibility || "client-shareable",
          scheduleDate: patch.scheduleDate || "",
          mediaIds: Array.isArray(patch.mediaIds) ? patch.mediaIds : [],
          publishState: patch.publishState || "draft",
          publishedAt: patch.publishedAt || "",
          scheduledAt: patch.scheduledAt || "",
          postType: patch.postType || "photo",
          platformVariants: patch.platformVariants && typeof patch.platformVariants === "object" ? patch.platformVariants : {},
          assignee: patch.assignee || "",
          reviewer: patch.reviewer || "",
          comments: Array.isArray(patch.comments) ? patch.comments : [],
          checklist: patch.checklist && typeof patch.checklist === "object" ? patch.checklist : { copy: false, media: false, tags: false, schedule: false, approval: false },
          createdAt: now(),
          updatedAt: now()
        };
    state.posts = existing ? state.posts.map((p) => (p.id === post.id ? post : p)) : [post, ...state.posts];
    await saveState(state);
    return post;
  });
}

export function deletePost(postId) {
  return enqueue(async () => {
    const state = await loadState();
    const removedMedia = state.media.filter((m) => m.postId === postId);
    state.posts = state.posts.filter((p) => p.id !== postId);
    state.media = state.media.filter((m) => m.postId !== postId);
    await saveState(state);
    await cleanupMediaFiles(removedMedia);
  });
}

export function deleteClient(clientId) {
  return enqueue(async () => {
    const state = await loadState();
    const postIds = new Set(state.posts.filter((p) => p.clientId === clientId).map((p) => p.id));
    const removedMedia = state.media.filter((m) => postIds.has(m.postId));
    state.clients = state.clients.filter((c) => c.id !== clientId);
    state.posts = state.posts.filter((p) => p.clientId !== clientId);
    state.media = state.media.filter((m) => !postIds.has(m.postId));
    state.shareLinks = state.shareLinks.filter((sl) => sl.clientId !== clientId);
    await saveState(state);
    await cleanupMediaFiles(removedMedia);
  });
}

export function addMedia(record) {
  return enqueue(async () => {
    const state = await loadState();
    const media = {
      id: id(),
      postId: record.postId,
      fileName: record.fileName,
      mimeType: record.mimeType || "application/octet-stream",
      sizeBytes: Number(record.sizeBytes || 0),
      urlPath: record.urlPath,
      createdAt: now()
    };
    state.media = [media, ...state.media];
    state.posts = state.posts.map((post) =>
      post.id === record.postId ? { ...post, mediaIds: [...new Set([...(post.mediaIds || []), media.id])], updatedAt: now() } : post
    );
    await saveState(state);
    return media;
  });
}

export function removeMedia(postId, mediaId) {
  return enqueue(async () => {
    const state = await loadState();
    const post = state.posts.find((p) => p.id === postId);
    if (!post) return { ok: false, error: "Post not found" };

    const mediaRecord = state.media.find((m) => m.id === mediaId);
    if (!mediaRecord || mediaRecord.postId !== postId) {
      return { ok: false, error: "Media not found" };
    }

    state.media = state.media.filter((m) => m.id !== mediaId);
    state.posts = state.posts.map((p) =>
      p.id === postId
        ? {
            ...p,
            mediaIds: (Array.isArray(p.mediaIds) ? p.mediaIds : []).filter((id) => id !== mediaId),
            updatedAt: now()
          }
        : p
    );
    await saveState(state);
    await cleanupMediaFiles([mediaRecord]);

    return { ok: true, removedMediaId: mediaId, postId };
  });
}

export function reorderPostMedia(postId, orderedMediaIds = []) {
  return enqueue(async () => {
    const state = await loadState();
    const post = state.posts.find((p) => p.id === postId);
    if (!post) return null;

    const existing = Array.isArray(post.mediaIds) ? post.mediaIds : [];
    const ownedSet = new Set(existing);
    const requested = Array.isArray(orderedMediaIds) ? orderedMediaIds : [];

    const sanitizedOrdered = requested.filter((mediaId) => ownedSet.has(mediaId));
    const missing = existing.filter((mediaId) => !sanitizedOrdered.includes(mediaId));
    const nextMediaIds = [...sanitizedOrdered, ...missing];

    const updatedPost = { ...post, mediaIds: nextMediaIds, updatedAt: now() };
    state.posts = state.posts.map((p) => (p.id === postId ? updatedPost : p));
    await saveState(state);
    return updatedPost;
  });
}

export function createShareLink(clientId, token, expiresAt = "") {
  return enqueue(async () => {
    const state = await loadState();
    const link = { id: id(), clientId, token, expiresAt, revokedAt: "", createdAt: now() };
    state.shareLinks = [link, ...state.shareLinks];
    await saveState(state);
    return link;
  });
}

export async function findUserByEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;
  const state = await loadState();
  return state.users.find((user) => String(user.email || "").trim().toLowerCase() === normalized) || null;
}

export function upsertUser(patch) {
  return enqueue(async () => {
    const state = await loadState();
    const existing = state.users.find((u) => u.id === patch.id);
    const normalizedEmail = String(patch.email || existing?.email || "").trim().toLowerCase();

    const duplicate = state.users.find((u) => {
      if (!u?.email) return false;
      if (existing && u.id === existing.id) return false;
      return String(u.email).trim().toLowerCase() === normalizedEmail;
    });

    if (duplicate) {
      const error = new Error("Email already in use");
      error.code = "EMAIL_ALREADY_IN_USE";
      throw error;
    }

    const hasPasswordHash = typeof patch.passwordHash === "string" && patch.passwordHash.length > 0;
    const base = existing ? { ...existing } : {
      id: patch.id || id(),
      email: normalizedEmail,
      name: "User",
      role: "client_user",
      passwordHash: "",
      disabledAt: "",
      createdAt: now(),
      updatedAt: now()
    };

    const user = {
      ...base,
      ...(patch.name !== undefined ? { name: String(patch.name || "").trim() || base.name || "User" } : {}),
      ...(patch.role !== undefined ? { role: patch.role || base.role || "client_user" } : {}),
      ...(patch.disabledAt !== undefined ? { disabledAt: patch.disabledAt || "" } : {}),
      ...(patch.email !== undefined ? { email: normalizedEmail } : {}),
      ...(hasPasswordHash ? { passwordHash: patch.passwordHash } : {}),
      updatedAt: now()
    };

    state.users = existing ? state.users.map((u) => (u.id === user.id ? user : u)) : [user, ...state.users];
    await saveState(state);
    return user;
  });
}

export function upsertMembership(patch) {
  return enqueue(async () => {
    const state = await loadState();
    const existing = state.memberships.find(
      (m) => m.userId === patch.userId && m.clientId === patch.clientId
    );
    const nextPermissions = Array.isArray(patch.permissions) ? [...new Set(patch.permissions)] : ["view"];
    const membership = existing
      ? { ...existing, permissions: nextPermissions, updatedAt: now() }
      : {
          id: patch.id || id(),
          userId: patch.userId,
          clientId: patch.clientId,
          permissions: nextPermissions,
          createdAt: now(),
          updatedAt: now()
        };
    state.memberships = existing
      ? state.memberships.map((m) => (m.id === membership.id ? membership : m))
      : [membership, ...state.memberships];
    await saveState(state);
    return membership;
  });
}

export function deleteUserAndMemberships(userId) {
  return enqueue(async () => {
    const state = await loadState();
    state.users = (state.users || []).filter((user) => user.id !== userId);
    state.memberships = (state.memberships || []).filter((membership) => membership.userId !== userId);
    await saveState(state);
    return { ok: true, deletedUserId: userId };
  });
}

export function addPostComment(postId, comment) {
  return enqueue(async () => {
    const state = await loadState();
    let updated = null;
    state.posts = state.posts.map((post) => {
      if (post.id !== postId) return post;
      updated = {
        ...post,
        comments: [...(Array.isArray(post.comments) ? post.comments : []), comment],
        updatedAt: now()
      };
      return updated;
    });
    if (!updated) return null;
    state.activity = [{
      id: id(),
      type: "post.comment.added",
      postId,
      clientId: updated.clientId || "",
      actorUserId: comment.authorUserId || "",
      createdAt: now()
    }, ...state.activity].slice(0, 5000);
    await saveState(state);
    return updated;
  });
}
