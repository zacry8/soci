import { verifyAuthToken } from "../auth.js";
import { addPostComment, loadState, removeMedia, reorderPostMedia, upsertPost } from "../db.js";
import { id, json, readJsonBody } from "../utils.js";
import { validateComment, validatePost } from "../validators.js";
import { ADMIN_ROLES, buildAccessContext, canAccessClient, canAccessPost, getCapabilities } from "../permissions.js";

function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name || "",
    role: user.role || "client_user"
  };
}

function buildOwnerFromClaims(claims) {
  return {
    id: claims.userId || "owner-admin",
    email: claims.email || "",
    name: "Owner",
    role: claims.role || "owner_admin"
  };
}

async function requireUser(req, res) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const claims = verifyAuthToken(token);
  if (!claims || !claims.role) {
    json(res, 401, { error: "Unauthorized" });
    return null;
  }

  const state = await loadState();
  const user = state.users.find((value) => value.id === claims.userId) || null;
  if (!user && !ADMIN_ROLES.has(claims.role)) {
    json(res, 401, { error: "Unauthorized" });
    return null;
  }

  return {
    claims,
    state,
    user: user || buildOwnerFromClaims(claims)
  };
}

export function registerMeRoutes(router, config) {
  // GET /api/me/state — role-scoped state for owner/helper/client users
  router.get("/api/me/state", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;

    const { user, state } = auth;
    if (user.disabledAt) return json(res, 403, { error: "User disabled" });
    const access = buildAccessContext(state, user);
    const capabilities = getCapabilities(access);
    if (ADMIN_ROLES.has(user.role)) {
      const permissionsByClient = Object.fromEntries((state.clients || []).map((client) => [client.id, "manage"]));
      return json(res, 200, {
        user: toPublicUser(user),
        clients: state.clients,
        memberships: state.memberships,
        posts: state.posts,
        media: state.media,
        apiBaseUrl: config.apiBaseUrl,
        authContext: { capabilities, permissionsByClient }
      });
    }

    const memberships = access.memberships;
    const allowedClientIds = access.allowedClientIds;
    const clients = state.clients.filter((client) => allowedClientIds.has(client.id));
    const posts = state.posts.filter((post) => {
      if (!allowedClientIds.has(post.clientId)) return false;
      if (user.role === "client_user" && post.visibility === "internal") return false;
      return true;
    });
    const postIds = new Set(posts.map((post) => post.id));
    const media = state.media.filter((record) => postIds.has(record.postId));

    return json(res, 200, {
      user: toPublicUser(user),
      clients,
      memberships,
      posts,
      media,
      apiBaseUrl: config.apiBaseUrl,
      authContext: {
        capabilities,
        permissionsByClient: access.permissionsByClient
      }
    });
  });

  // POST /api/me/posts — create or update post in permitted client scope
  router.post("/api/me/posts", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const { user, state } = auth;
    if (user.disabledAt) return json(res, 403, { error: "User disabled" });

    const body = await readJsonBody(req, config.maxJsonBytes).catch((e) => ({ __error: e?.message || "Invalid JSON" }));
    if (body?.__error) return json(res, body.__error === "Payload too large" ? 413 : 400, { error: body.__error });
    const validationError = validatePost(body);
    if (validationError) return json(res, 400, { error: validationError });

    const access = buildAccessContext(state, user);
    if (access.isAdmin) {
      const post = await upsertPost(body);
      return json(res, 200, { post });
    }

    const existing = body.id ? state.posts.find((post) => post.id === body.id) : null;
    if (existing) {
      if (!canAccessPost(access, existing, "edit")) {
        return json(res, 403, { error: "Insufficient permissions" });
      }
      if (body.clientId && body.clientId !== existing.clientId) {
        return json(res, 403, { error: "Cannot move post across clients" });
      }
    } else {
      if (!body.clientId) return json(res, 400, { error: "clientId is required" });
      if (!canAccessClient(access, body.clientId, "edit")) {
        return json(res, 403, { error: "Insufficient permissions" });
      }
    }

    const post = await upsertPost(existing ? { ...existing, ...body } : body);
    return json(res, 200, { post });
  });

  // POST /api/me/posts/:postId/comments — add comment if membership allows comment/edit/manage
  router.post("/api/me/posts/:postId/comments", async (req, res, params) => {
    const auth = await requireUser(req, res);
    if (!auth) return;

    const { user, state } = auth;
    if (!params?.postId) return json(res, 400, { error: "postId required" });

    const post = state.posts.find((item) => item.id === params.postId);
    if (!post) return json(res, 404, { error: "Post not found" });

    const access = buildAccessContext(state, user);
    if (!canAccessPost(access, post, "comment")) {
        return json(res, 403, { error: "Insufficient permissions" });
    }

    const body = await readJsonBody(req, config.maxJsonBytes).catch((e) => ({ __error: e?.message || "Invalid JSON" }));
    if (body?.__error) return json(res, body.__error === "Payload too large" ? 413 : 400, { error: body.__error });
    const validationError = validateComment(body);
    if (validationError) return json(res, 400, { error: validationError });

    const comment = {
      id: id(),
      author: String(body.author || user.name || user.email || "Teammate").trim(),
      authorUserId: user.id,
      text: String(body.text || "").trim(),
      at: new Date().toISOString()
    };

    const updatedPost = await addPostComment(post.id, comment);
    if (!updatedPost) return json(res, 404, { error: "Post not found" });
    return json(res, 200, { post: updatedPost, comment });
  });

  // DELETE /api/me/posts/:postId/media/:mediaId — remove media with edit rights
  router.delete("/api/me/posts/:postId/media/:mediaId", async (req, res, params) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const { user, state } = auth;
    if (!params?.postId || !params?.mediaId) return json(res, 400, { error: "postId and mediaId required" });

    const post = state.posts.find((item) => item.id === params.postId);
    if (!post) return json(res, 404, { error: "Post not found" });
    const access = buildAccessContext(state, user);
    if (!canAccessPost(access, post, "edit")) return json(res, 403, { error: "Insufficient permissions" });

    const result = await removeMedia(params.postId, params.mediaId);
    if (!result?.ok) {
      const status = result?.error === "Post not found" || result?.error === "Media not found" ? 404 : 400;
      return json(res, status, { error: result?.error || "Could not remove media" });
    }
    return json(res, 200, { ok: true, removedMediaId: params.mediaId, postId: params.postId });
  });

  // POST /api/me/posts/:postId/media/reorder — reorder media with edit rights
  router.post("/api/me/posts/:postId/media/reorder", async (req, res, params) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const { user, state } = auth;
    if (!params?.postId) return json(res, 400, { error: "postId required" });

    const post = state.posts.find((item) => item.id === params.postId);
    if (!post) return json(res, 404, { error: "Post not found" });
    const access = buildAccessContext(state, user);
    if (!canAccessPost(access, post, "edit")) return json(res, 403, { error: "Insufficient permissions" });

    const body = await readJsonBody(req, config.maxJsonBytes).catch((e) => ({ __error: e?.message || "Invalid JSON" }));
    if (body?.__error) return json(res, body.__error === "Payload too large" ? 413 : 400, { error: body.__error });
    if (!Array.isArray(body.mediaIds)) return json(res, 400, { error: "mediaIds array is required" });

    const updated = await reorderPostMedia(params.postId, body.mediaIds);
    if (!updated) return json(res, 404, { error: "Post not found" });
    return json(res, 200, { post: updated });
  });
}
