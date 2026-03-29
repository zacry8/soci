import fs from "node:fs/promises";
import path from "node:path";
import { verifyAuthToken } from "../auth.js";
import { addMedia, addPostComment, loadState, removeMedia, reorderPostMedia, upsertClient, upsertMembership, upsertPost } from "../db.js";
import { id, json, readJsonBody, sanitizeFileName, validateFilePath } from "../utils.js";
import { validateClient, validateComment, validatePost } from "../validators.js";
import { ADMIN_ROLES, buildAccessContext, canAccessClient, canAccessPost, getCapabilities } from "../permissions.js";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "video/mp4", "video/quicktime", "video/webm",
  "application/pdf",
]);

function checkMagicBytes(buf, mimeType) {
  if (buf.length < 4) return false;
  if (mimeType === "image/jpeg") return buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
  if (mimeType === "image/png") return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  if (mimeType === "image/gif") return buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38;
  if (mimeType === "image/webp") {
    if (buf.length < 12) return false;
    return buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
           buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
  }
  if (mimeType === "video/mp4" || mimeType === "video/quicktime") {
    if (buf.length < 8) return false;
    return buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70;
  }
  if (mimeType === "video/webm") return buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3;
  if (mimeType === "application/pdf") return buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
  return false;
}

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

  // POST /api/me/clients — create or update an owned client (account)
  router.post("/api/me/clients", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const { user, state } = auth;
    if (user.disabledAt) return json(res, 403, { error: "User disabled" });

    const body = await readJsonBody(req, config.maxJsonBytes).catch((e) => ({ __error: e?.message || "Invalid JSON" }));
    if (body?.__error) return json(res, body.__error === "Payload too large" ? 413 : 400, { error: body.__error });
    const err = validateClient(body);
    if (err) return json(res, 400, { error: err });

    const access = buildAccessContext(state, user);

    if (body.id) {
      // Update — user must have manage permission on this client
      if (!canAccessClient(access, body.id, "manage")) {
        return json(res, 403, { error: "Insufficient permissions" });
      }
      const client = await upsertClient(body);
      return json(res, 200, { client });
    }

    // Create — auto-assign manage membership to creator
    const client = await upsertClient(body);
    if (!access.isAdmin) {
      await upsertMembership({
        userId: user.id,
        clientId: client.id,
        permissions: ["view", "comment", "edit", "manage"]
      });
    }
    return json(res, 200, { client });
  });

  // POST /api/me/media — upload media to a post in an owned client
  router.post("/api/me/media", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const { user, state } = auth;
    if (user.disabledAt) return json(res, 403, { error: "User disabled" });

    const body = await readJsonBody(req, config.maxUploadBytes).catch((e) => ({ __error: e?.message || "Invalid JSON" }));
    if (body?.__error) return json(res, body.__error === "Payload too large" ? 413 : 400, { error: body.__error });
    if (!body.postId || !body.contentBase64) return json(res, 400, { error: "postId and contentBase64 are required" });

    if (!ALLOWED_MIME_TYPES.has(body.mimeType)) {
      return json(res, 415, { error: "Unsupported media type" });
    }

    const post = state.posts.find((p) => p.id === body.postId);
    if (!post) return json(res, 404, { error: "Post not found" });

    const access = buildAccessContext(state, user);
    if (!canAccessPost(access, post, "edit")) {
      return json(res, 403, { error: "Insufficient permissions" });
    }

    const bytes = Buffer.from(body.contentBase64, "base64");
    if (!checkMagicBytes(bytes, body.mimeType)) {
      return json(res, 415, { error: "File content does not match declared type or file is corrupted" });
    }

    const safeName = sanitizeFileName(body.fileName || "media.bin");
    const ext = path.extname(safeName) || ".bin";
    const fileName = `${id()}${ext}`;
    const absolute = validateFilePath(fileName, config.uploadDir);
    if (!absolute) return json(res, 400, { error: "Invalid file path" });

    try {
      await fs.mkdir(config.uploadDir, { recursive: true });
      await fs.writeFile(absolute, bytes);
    } catch (err) {
      console.error("[soci] media write failed:", err);
      return json(res, 500, { error: "Failed to save media file." });
    }

    const media = await addMedia({
      postId: body.postId,
      fileName: safeName,
      mimeType: body.mimeType,
      sizeBytes: bytes.length,
      urlPath: `/uploads/${fileName}`
    });
    return json(res, 200, { media, publicUrl: `${config.apiBaseUrl}${media.urlPath}` });
  });
}
