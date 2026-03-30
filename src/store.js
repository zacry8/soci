import { createEmptyClient, createEmptyPost, makeSeedClients, makeSeedPosts, STATUSES } from "./data.js";
import {
  assignMembership,
  createShareLink,
  createUser,
  disableAdminUser,
  deleteMyPostMedia,
  deleteClient as apiDeleteClient,
  deletePostMedia as apiDeletePostMedia,
  deletePost as apiDeletePost,
  enableAdminUser,
  ensureAdminToken,
  getAdminUsers,
  getAdminUserStats,
  getAdminState,
  getAuthToken,
  getAuthUser,
  getMyState,
  reorderPostMedia as apiReorderPostMedia,
  resetAdminUserPassword,
  getShareCalendar,
  upsertMyPost,
  reorderMyPostMedia as apiReorderMyPostMedia,
  resolveApiUrl,
  uploadMedia,
  uploadMyMedia,
  createMyClient,
  upsertClient,
  upsertPost
} from "./api.js";

const STORAGE_KEY_ACTIVE_CLIENT = "soci.activeClientId.v1";
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

function clone(value) {
  return structuredClone(value);
}

function normalizeClient(client) {
  const incomingProfile = client?.profileSettings && typeof client.profileSettings === "object" && !Array.isArray(client.profileSettings)
    ? client.profileSettings
    : {};
  const profileSettings = {};
  for (const [key, value] of Object.entries(incomingProfile)) {
    if (!PROFILE_SETTING_KEYS.has(key)) continue;
    if (value === undefined || value === null) continue;
    profileSettings[key] = String(value);
  }
  return {
    id: client?.id || crypto.randomUUID(),
    name: client?.name || "Client",
    channels: Array.isArray(client?.channels) && client.channels.length ? client.channels : ["Instagram"],
    shareSlug: client?.shareSlug || "client",
    sharingEnabled: client?.sharingEnabled !== false,
    profileSettings
  };
}

function normalizePost(post, clients) {
  const fallbackClientId = clients[0]?.id || "";
  const normalizedType = post?.postType === "static"
    ? "photo"
    : post?.postType === "reel"
    ? "shorts"
    : post?.postType || "photo";
  return {
    ...post,
    clientId: post.clientId || fallbackClientId,
    platforms: Array.isArray(post.platforms) && post.platforms.length ? post.platforms : ["Instagram"],
    visibility: post.visibility || "client-shareable",
    publishState: post.publishState || "draft",
    publishedAt: post.publishedAt || "",
    scheduledAt: post.scheduledAt || "",
    postType: normalizedType,
    mediaIds: Array.isArray(post.mediaIds) ? post.mediaIds : [],
    comments: Array.isArray(post.comments) ? post.comments : [],
    checklist: post.checklist && typeof post.checklist === "object"
      ? post.checklist
      : { copy: false, media: false, tags: false, schedule: false, approval: false }
  };
}

function normalizeMediaRecord(record) {
  const token = getAuthToken();
  const resolved = resolveApiUrl(record?.urlPath || record?.publicUrl || "");
  const withToken = token
    ? (resolved.includes("?") ? `${resolved}&token=${encodeURIComponent(token)}` : `${resolved}?token=${encodeURIComponent(token)}`)
    : resolved;
  return {
    ...record,
    urlPath: withToken
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
  let authUser = getAuthUser();
  let authContext = { capabilities: {}, permissionsByClient: {} };
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

  const resetState = ({ keepAuthContext = false } = {}) => {
    clients = [];
    posts = [];
    media = [];
    activeClientId = "";
    activePostId = null;
    authToken = "";
    authUser = getAuthUser();
    authContext = keepAuthContext ? authContext : { capabilities: {}, permissionsByClient: {} };
    isBootstrapped = false;
  };

  const getState = () => ({
    posts: clone(posts),
    media: clone(media),
    activePostId,
    clients: clone(clients),
    activeClientId,
    isBootstrapped,
    authContext: clone(authContext)
  });

  const canManageAsAdmin = () => ["owner_admin", "admin"].includes(authUser?.role || "");
  const canPermission = (clientId, minimum = "view") => {
    if (canManageAsAdmin()) return true;
    const order = ["view", "comment", "edit", "manage"];
    const current = authContext?.permissionsByClient?.[clientId] || "";
    const currentRank = order.indexOf(current);
    const requiredRank = order.indexOf(minimum);
    return currentRank >= requiredRank && requiredRank >= 0;
  };

  const maybeBootstrap = async ({ force = false } = {}) => {
    if (isBootstrapped && !force) return;
    try {
      authToken = await ensureAdminToken();
      authUser = getAuthUser();
      const role = authUser?.role || "owner_admin";
      const state = ["owner_admin", "admin"].includes(role)
        ? await getAdminState(authToken)
        : await getMyState(authToken);
      clients = (state.clients || []).map(normalizeClient);
      posts = (state.posts || []).map((post) => normalizePost(post, clients));
      media = Array.isArray(state.media) ? state.media.map(normalizeMediaRecord) : [];
      authContext = state.authContext && typeof state.authContext === "object"
        ? {
            capabilities: state.authContext.capabilities || {},
            permissionsByClient: state.authContext.permissionsByClient || {}
          }
        : { capabilities: {}, permissionsByClient: {} };
      if (!clients.length && ["owner_admin", "admin"].includes(role)) {
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
      authContext = { capabilities: {}, permissionsByClient: {} };
      activeClientId = clients[0]?.id || "";
      activePostId = posts[0]?.id || null;
      isBootstrapped = true;
      notify();
    }
  };

  const syncClient = async (client) => {
    if (!authToken) return;
    const isNewForUser = !canManageAsAdmin() && !authContext?.permissionsByClient?.[client.id];
    try {
      const res = canManageAsAdmin()
        ? await upsertClient(authToken, client)
        : await createMyClient(authToken, client);
      const persisted = normalizeClient(res.client || client);
      clients = clients.map((c) => (c.id === persisted.id ? persisted : c));
      if (isNewForUser && authContext?.permissionsByClient) {
        authContext.permissionsByClient[persisted.id] = "manage";
      }
      notify();
    } catch (error) {
      reportSyncError("Client save failed on server.", error);
    }
  };

  const syncPost = async (post) => {
    if (!authToken) return;
    try {
      const res = canManageAsAdmin()
        ? await upsertPost(authToken, post)
        : await upsertMyPost(authToken, post);
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
    async refreshSession() {
      resetState();
      notify();
      await maybeBootstrap({ force: true });
    },
    resetSession() {
      resetState();
      notify();
    },
    setErrorHandler(handler) {
      errorHandler = typeof handler === "function" ? handler : null;
    },
    getCurrentUser() {
      return authUser;
    },
    getAuthContext() {
      return clone(authContext);
    },
    canEditPost(post) {
      if (!post?.clientId) return false;
      if (!canPermission(post.clientId, "edit")) return false;
      if ((authUser?.role || "") === "client_user" && post.visibility === "internal") return false;
      return true;
    },
    canCommentOnPost(post) {
      if (!post?.clientId) return false;
      if (!canPermission(post.clientId, "comment")) return false;
      if ((authUser?.role || "") === "client_user" && post.visibility === "internal") return false;
      return true;
    },
    canManageUsers() {
      if (canManageAsAdmin()) return true;
      return Boolean(authContext?.capabilities?.canManageUsers);
    },
    canManageClients() {
      if (canManageAsAdmin()) return true;
      return Boolean(authContext?.capabilities?.canManageClients);
    },
    canCreateClients() {
      return Boolean(authContext?.capabilities?.canCreateClients) || canManageAsAdmin();
    },
    canCreatePosts() {
      if (canManageAsAdmin()) return true;
      if (typeof authContext?.capabilities?.canCreatePosts === "boolean") {
        return authContext.capabilities.canCreatePosts;
      }
      return Object.keys(authContext?.permissionsByClient || {}).some((clientId) => canPermission(clientId, "edit"));
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(getState());
      void maybeBootstrap();
      return () => listeners.delete(listener);
    },
    createPost() {
      if (!this.canCreatePosts()) return;
      const post = createEmptyPost(activeClientId || clients[0]?.id || "");
      setPosts([post, ...posts]);
      activePostId = post.id;
      notify();
      void syncPost(post);
    },
    createClient(name) {
      if (!this.canCreateClients()) return;
      const client = createEmptyClient(name?.trim() || "New Client");
      setClients([client, ...clients]);
      activeClientId = client.id;
      localStorage.setItem(STORAGE_KEY_ACTIVE_CLIENT, activeClientId);
      notify();
      void syncClient(client);
    },
    updateClientProfileSettings(clientId, patch) {
      const target = clients.find((client) => client.id === clientId);
      if (!target) return;
      const nextClient = normalizeClient({
        ...target,
        profileSettings: {
          ...(target.profileSettings || {}),
          ...((patch && typeof patch === "object") ? patch : {})
        }
      });
      clients = clients.map((client) => (client.id === clientId ? nextClient : client));
      notify();
      void syncClient(nextClient);
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
      const existing = posts.find((p) => p.id === id);
      if (!this.canEditPost(existing)) return;
      const next = posts.map((p) => (p.id === id ? { ...p, ...patch } : p));
      setPosts(next);
      const updated = posts.find((p) => p.id === id);
      if (updated) void syncPost(updated);
    },
    movePost(id, status) {
      if (!STATUSES.includes(status)) return;
      const post = posts.find((p) => p.id === id);
      if (!post) return;
      if (!this.canEditPost(post)) return;
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
      const existing = posts.find((p) => p.id === id);
      if (!this.canCommentOnPost(existing)) return;
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
      if (!canManageAsAdmin()) return;
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
      if (!canManageAsAdmin()) return;
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
      if (!this.canEditPost(original)) return;
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
        result = canManageAsAdmin()
          ? await uploadMedia(authToken, { postId, file })
          : await uploadMyMedia(authToken, { postId, file });
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
    },
    async removePostMedia(postId, mediaId) {
      const targetPost = posts.find((post) => post.id === postId);
      if (!targetPost) return;
      if (!this.canEditPost(targetPost)) {
        throw new Error("Insufficient permissions");
      }

      const previousPosts = clone(posts);
      const previousMedia = clone(media);

      posts = posts.map((post) =>
        post.id === postId
          ? {
              ...post,
              mediaIds: (post.mediaIds || []).filter((id) => id !== mediaId)
            }
          : post
      );
      media = media.filter((item) => item.id !== mediaId);
      notify();

      try {
        if (!authToken) authToken = await ensureAdminToken();
        if (canManageAsAdmin()) {
          await apiDeletePostMedia(authToken, postId, mediaId);
        } else {
          await deleteMyPostMedia(authToken, postId, mediaId);
        }
      } catch (error) {
        posts = previousPosts;
        media = previousMedia;
        notify();
        reportSyncError("Could not remove media.", error);
        throw error;
      }
    },
    async reorderPostMedia(postId, orderedMediaIds) {
      const targetPost = posts.find((post) => post.id === postId);
      if (!targetPost) return;
      if (!this.canEditPost(targetPost)) {
        throw new Error("Insufficient permissions");
      }

      const existing = Array.isArray(targetPost.mediaIds) ? targetPost.mediaIds : [];
      const owned = new Set(existing);
      const requested = Array.isArray(orderedMediaIds) ? orderedMediaIds : [];
      const nextOrder = requested.filter((id) => owned.has(id));
      const missing = existing.filter((id) => !nextOrder.includes(id));
      const finalOrder = [...nextOrder, ...missing];

      const previousPosts = clone(posts);
      posts = posts.map((post) =>
        post.id === postId
          ? { ...post, mediaIds: finalOrder }
          : post
      );
      notify();

      try {
        if (!authToken) authToken = await ensureAdminToken();
        if (canManageAsAdmin()) {
          await apiReorderPostMedia(authToken, postId, finalOrder);
        } else {
          await apiReorderMyPostMedia(authToken, postId, finalOrder);
        }
      } catch (error) {
        posts = previousPosts;
        notify();
        reportSyncError("Could not reorder media.", error);
        throw error;
      }
    },
    async adminCreateUser(payload) {
      try {
        if (!authToken) authToken = await ensureAdminToken();
        return await createUser(authToken, payload);
      } catch (error) {
        reportSyncError("Could not create user.", error);
        throw error;
      }
    },
    async adminAssignMembership(payload) {
      try {
        if (!authToken) authToken = await ensureAdminToken();
        return await assignMembership(authToken, payload);
      } catch (error) {
        reportSyncError("Could not assign membership.", error);
        throw error;
      }
    },
    async adminGetUsers() {
      try {
        if (!authToken) authToken = await ensureAdminToken();
        return await getAdminUsers(authToken);
      } catch (error) {
        reportSyncError("Could not load users.", error);
        throw error;
      }
    },
    async adminGetUserStats() {
      try {
        if (!authToken) authToken = await ensureAdminToken();
        return await getAdminUserStats(authToken);
      } catch (error) {
        reportSyncError("Could not load user stats.", error);
        throw error;
      }
    },
    async adminDisableUser(userId) {
      try {
        if (!authToken) authToken = await ensureAdminToken();
        return await disableAdminUser(authToken, userId);
      } catch (error) {
        reportSyncError("Could not disable user.", error);
        throw error;
      }
    },
    async adminEnableUser(userId) {
      try {
        if (!authToken) authToken = await ensureAdminToken();
        return await enableAdminUser(authToken, userId);
      } catch (error) {
        reportSyncError("Could not enable user.", error);
        throw error;
      }
    },
    async adminResetUserPassword(userId, password) {
      try {
        if (!authToken) authToken = await ensureAdminToken();
        return await resetAdminUserPassword(authToken, userId, password);
      } catch (error) {
        reportSyncError("Could not reset user password.", error);
        throw error;
      }
    }
  };
}