import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { id, now } from "./utils.js";

const initialState = () => ({
  clients: [],
  posts: [],
  media: [],
  shareLinks: [],
  updatedAt: now()
});

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
    return { ...initialState(), ...JSON.parse(raw) };
  } catch {
    return initialState();
  }
}

let writeQueue = Promise.resolve();

export async function saveState(state) {
  const next = { ...state, updatedAt: now() };
  writeQueue = writeQueue.then(async () => {
    const tmp = config.dataFile + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(next, null, 2));
    await fs.rename(tmp, config.dataFile); // atomic on Linux (same filesystem)
  });
  await writeQueue;
  return next;
}

export async function upsertClient(patch) {
  const state = await loadState();
  const existing = state.clients.find((c) => c.id === patch.id);
  const client = existing
    ? { ...existing, ...patch, updatedAt: now() }
    : {
        id: patch.id || id(),
        name: patch.name || "Client",
        channels: Array.isArray(patch.channels) && patch.channels.length ? patch.channels : ["Instagram"],
        shareSlug: patch.shareSlug || String(patch.name || "client").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        sharingEnabled: patch.sharingEnabled !== false,
        createdAt: now(),
        updatedAt: now()
      };
  state.clients = existing ? state.clients.map((c) => (c.id === client.id ? client : c)) : [client, ...state.clients];
  await saveState(state);
  return client;
}

export async function upsertPost(patch) {
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
        postType: patch.postType || "static",
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
}

export async function deletePost(postId) {
  const state = await loadState();
  state.posts = state.posts.filter((p) => p.id !== postId);
  state.media = state.media.filter((m) => m.postId !== postId);
  await saveState(state);
}

export async function deleteClient(clientId) {
  const state = await loadState();
  const postIds = new Set(state.posts.filter((p) => p.clientId === clientId).map((p) => p.id));
  state.clients = state.clients.filter((c) => c.id !== clientId);
  state.posts = state.posts.filter((p) => p.clientId !== clientId);
  state.media = state.media.filter((m) => !postIds.has(m.postId));
  state.shareLinks = state.shareLinks.filter((sl) => sl.clientId !== clientId);
  await saveState(state);
}

export async function addMedia(record) {
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
}

export async function createShareLink(clientId, token, expiresAt = "") {
  const state = await loadState();
  const link = { id: id(), clientId, token, expiresAt, revokedAt: "", createdAt: now() };
  state.shareLinks = [link, ...state.shareLinks];
  await saveState(state);
  return link;
}
