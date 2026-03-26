import { createEmptyClient, createEmptyPost, makeSeedClients, makeSeedPosts, STATUSES } from "./data.js";
import { createShareLink, deleteClient as apiDeleteClient, deletePost as apiDeletePost, ensureAdminToken, getAdminState, getShareCalendar, resolveApiUrl, uploadMedia, upsertClient, upsertPost } from "./api.js";

const STORAGE_KEY_ACTIVE_CLIENT = "soci.activeClientId.v1";

function clone(value) {
  return structuredClone(value);
}

function normalizeClient(client) {
  return {
    id: client?.id || crypto.randomUUID(),
    name: client?.name || "Client",
    channels: Array.isArray(client?.channels) && client.channels.length ? client.channels : ["Instagram"],
    shareSlug: client?.shareSlug || "client",
    sharingEnabled: client?.sharingEnabled !== false
  };
}

function normalizePost(post, clients) {
  const fallbackClientId = clients[0]?.id || "";
  return {
    ...post,
    clientId: post.clientId || fallbackClientId,
    visibility: post.visibility || "client-shareable",
    publishState: post.publishState || "draft",
    publishedAt: post.publishedAt || "",
    scheduledAt: post.scheduledAt || "",
    postType: post.postType || "static",
    mediaIds: Array.isArray(post.mediaIds) ? post.mediaIds : [],
    comments: Array.isArray(post.comments) ? post.comments : [],
    checklist: post.checklist && typeof post.checklist === "object"
      ? post.checklist
      : { copy: false, media: false, tags: false, schedule: false, approval: false }
  };
}

function normalizeMediaRecord(record) {
  return {
    ...record,
    urlPath: resolveApiUrl(record?.urlPath || record?.publicUrl || "")
  };
}

function validatePost(post) {
  if (post.publishState === "published" && !post.publishedAt) return false;
  if (post.publishState === "scheduled" && !(post.scheduledAt || post.scheduleDate)) return false;
  return true;
}

export function sortByProfileOrder(posts) {
  const score = (post) => {
    if (post.publishState === "published") return new Date(post.publishedAt || 0).getTime() || 0;
    if (post.publishState === "scheduled") return new Date(post.scheduledAt || `${post.scheduleDate}T09:00:00` || 0).getTime() || 0;
    return -1;
  };

  return [...posts].sort((a, b) => score(b) - score(a));
}

export function profileIntegrity(posts) {
  const invalid = posts.filter((p) => !validatePost(p));
  if (invalid.length) return { level: "error", message: `${invalid.length} posts missing publish metadata.` };
  return { level: "ok", message: "Profile integrity verified." };
}

export function createStore() {
  let clients = [];
  let posts = [];
  let media = [];
  let activeClientId = localStorage.getItem(STORAGE_KEY_ACTIVE_CLIENT) || clients[0]?.id || "";
  let activePostId = posts[0]?.id ?? null;
  let authToken = "";
  let isBootstrapped = false;
  let errorHandler = null;
  const listeners = new Set();

  const reportSyncError = (message, error) => {
    console.error(error);
    if (typeof errorHandler === "function") errorHandler(message, error);
  };

  const notify = () => {
    for (const listener of listeners) listener(getState());
  };

  const getState = () => ({ posts: clone(posts), media: clone(media), activePostId, clients: clone(clients), activeClientId, isBootstrapped });

  const maybeBootstrap = async () => {
    if (isBootstrapped) return;
    try {
      authToken = await ensureAdminToken();
      const state = await getAdminState(authToken);
      clients = (state.clients || []).map(normalizeClient);
      posts = (state.posts || []).map((post) => normalizePost(post, clients));
      media = Array.isArray(state.media) ? state.media.map(normalizeMediaRecord) : [];
      if (!clients.length) {
        clients = makeSeedClients().map(normalizeClient);
        posts = makeSeedPosts(clients).map((post) => normalizePost(post, clients));
        for (const client of clients) void syncClient(client);
        for (const post of posts) void syncPost(post);
      }
      if (!clients.some((client) => client.id === activeClientId)) {
        activeClientId = clients[0]?.id || "";
        localStorage.setItem(STORAGE_KEY_ACTIVE_CLIENT, activeClientId);
      }
      if (!posts.some((post) => post.id === activePostId)) {
        activePostId = posts[0]?.id || null;
      }
      isBootstrapped = true;
      notify();
    } catch (error) {
      if (error?.isAuthError) {
        reportSyncError("Session expired. Please sign in again.", error);
        return;
      }
      reportSyncError("Could not load server state. Using local fallback data.", error);
      clients = makeSeedClients().map(normalizeClient);
      posts = makeSeedPosts(clients).map((post) => normalizePost(post, clients));
      media = [];
      activeClientId = clients[0]?.id || "";
      activePostId = posts[0]?.id || null;
      isBootstrapped = true;
      notify();
    }
  };

  const syncClient = async (client) => {
    if (!authToken) return;
    try {
      const res = await upsertClient(authToken, client);
      const persisted = normalizeClient(res.client || client);
      clients = clients.map((c) => (c.id === persisted.id ? persisted : c));
      notify();
    } catch (error) {
      reportSyncError("Client save failed on server.", error);
    }
  };

  const syncPost = async (post) => {
    if (!authToken) return;
    try {
      const res = await upsertPost(authToken, post);
      const persisted = normalizePost({ ...post, ...(res.post || {}) }, clients);
      posts = posts.map((p) => (p.id === persisted.id ? persisted : p));
      notify();
    } catch (error) {
      reportSyncError("Post save failed on server.", error);
    }
  };

  const setClients = (nextClients) => {
    clients = nextClients.map(normalizeClient);
    if (!clients.some((client) => client.id === activeClientId)) {
      activeClientId = clients[0]?.id || "";
      localStorage.setItem(STORAGE_KEY_ACTIVE_CLIENT, activeClientId);
    }
    posts = posts.map((post) => normalizePost(post, clients));
    notify();
  };

  const setPosts = (nextPosts) => {
    posts = nextPosts.map((p) => normalizePost({ ...p, updatedAt: new Date().toISOString() }, clients));
    notify();
  };

  return {
    setErrorHandler(handler) {
      errorHandler = typeof handler === "function" ? handler : null;
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(getState());
      void maybeBootstrap();
      return () => listeners.delete(listener);
    },
    createPost() {
      const post = createEmptyPost(activeClientId || clients[0]?.id || "");
      setPosts([post, ...posts]);
      activePostId = post.id;
      notify();
      void syncPost(post);
    },
    createClient(name) {
      const client = createEmptyClient(name?.trim() || "New Client");
      setClients([client, ...clients]);
      activeClientId = client.id;
      localStorage.setItem(STORAGE_KEY_ACTIVE_CLIENT, activeClientId);
      notify();
      void syncClient(client);
    },
    setActivePost(id) {
      activePostId = id;
      notify();
    },
    setActiveClient(id) {
      if (!clients.some((client) => client.id === id)) return;
      activeClientId = id;
      localStorage.setItem(STORAGE_KEY_ACTIVE_CLIENT, activeClientId);
      notify();
    },
    updatePost(id, patch) {
      const next = posts.map((p) => (p.id === id ? { ...p, ...patch } : p));
      setPosts(next);
      const updated = posts.find((p) => p.id === id);
      if (updated) void syncPost(updated);
    },
    movePost(id, status) {
      if (!STATUSES.includes(status)) return;
      const post = posts.find((p) => p.id === id);
      if (!post) return;
      if (!post.clientId) return;
      if ((status === "in-review" || status === "ready") && !post.scheduleDate) return;
      if (status === "ready" && !post.checklist.approval) return;
      const next = posts.map((p) => (p.id === id ? { ...p, status } : p));
      setPosts(next);
      const updated = next.find((p) => p.id === id);
      if (updated) void syncPost(updated);
    },
    addComment(id, author, text) {
      if (!text.trim()) return;
      const next = posts.map((p) =>
          p.id === id
            ? { ...p, comments: [...p.comments, { author: author || "Teammate", text, at: new Date().toISOString() }] }
            : p
      );
      setPosts(next);
      const updated = posts.find((p) => p.id === id);
      if (updated) void syncPost(updated);
    },
    deletePost(id) {
      const next = posts.filter((p) => p.id !== id);
      if (activePostId === id) activePostId = next[0]?.id ?? null;
      setPosts(next);
      if (authToken) {
        void apiDeletePost(authToken, id).catch((error) => {
          reportSyncError("Delete post failed on server.", error);
        });
      }
    },
    deleteClient(id) {
      const nextPosts = posts.filter((p) => p.clientId !== id);
      const nextMedia = media.filter((m) => nextPosts.some((p) => p.mediaIds?.includes(m.id)));
      posts = nextPosts;
      media = nextMedia;
      setClients(clients.filter((c) => c.id !== id));
      if (authToken) {
        void apiDeleteClient(authToken, id).catch((error) => {
          reportSyncError("Delete client failed on server.", error);
        });
      }
    },
    duplicatePost(id) {
      const original = posts.find((p) => p.id === id);
      if (!original) return;
      const stamp = new Date().toISOString();
      const copy = {
        ...structuredClone(original),
        id: crypto.randomUUID(),
        title: `${original.title} — Copy`,
        status: "idea",
        publishState: "draft",
        publishedAt: "",
        scheduledAt: "",
        scheduleDate: "",
        checklist: { copy: false, media: false, tags: false, schedule: false, approval: false },
        comments: [],
        createdAt: stamp,
        updatedAt: stamp
      };
      setPosts([copy, ...posts]);
      activePostId = copy.id;
      notify();
      void syncPost(copy);
    },
    getClientBySlug(slug) {
      return clients.find((client) => client.shareSlug === slug && client.sharingEnabled) || null;
    },
    async createClientShareLink(clientId) {
      try {
        if (!authToken) authToken = await ensureAdminToken();
        return createShareLink(authToken, clientId);
      } catch (error) {
        reportSyncError("Could not create share link.", error);
        throw error;
      }
    },
    async loadShareCalendar(token) {
      try {
        return getShareCalendar(token);
      } catch (error) {
        reportSyncError("Could not load shared calendar.", error);
        throw error;
      }
    },
    async uploadPostMedia(postId, file) {
      try {
        if (!authToken) authToken = await ensureAdminToken();
      } catch (error) {
        reportSyncError("Media upload auth failed.", error);
        throw error;
      }

      let result;
      try {
        result = await uploadMedia(authToken, { postId, file });
      } catch (error) {
        reportSyncError("Media upload failed on server.", error);
        throw error;
      }

      const mediaRecord = result.media;
      if (mediaRecord) {
        const normalizedMedia = normalizeMediaRecord(mediaRecord);
        media = [normalizedMedia, ...media.filter((m) => m.id !== normalizedMedia.id)];
        posts = posts.map((post) =>
          post.id === postId
            ? { ...post, mediaIds: [...new Set([...(post.mediaIds || []), normalizedMedia.id])] }
            : post
        );
        notify();
      }
      return result;
    }
  };
}