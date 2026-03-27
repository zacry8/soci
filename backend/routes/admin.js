import fs from "node:fs/promises";
import path from "node:path";
import { createAuthToken, hashPassword, verifyAuthToken } from "../auth.js";
import { addMedia, createShareLink, deleteClient, deletePost, loadState, removeMedia, reorderPostMedia, upsertClient, upsertMembership, upsertPost, upsertUser } from "../db.js";
import { id, json, readJsonBody, sanitizeFileName, validateFilePath } from "../utils.js";
import { validateClient, validateMembership, validatePost, validateUser } from "../validators.js";

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

async function requireAdmin(req, res) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const claims = verifyAuthToken(token);
  if (!claims || !new Set(["owner_admin", "admin"]).has(claims.role)) {
    json(res, 401, { error: "Unauthorized" });
    return null;
  }
  return claims;
}

export function registerAdminRoutes(router, config) {
  // GET /api/admin/state — full app state
  router.get("/api/admin/state", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const state = await loadState();
    const permissionsByClient = Object.fromEntries(
      (state.clients || []).map((c) => [c.id, "manage"])
    );
    return json(res, 200, {
      ...state,
      authContext: {
        capabilities: {
          canUploadMedia: true,
          canManageUsers: true,
          canManageClients: true,
          canCreatePosts: true
        },
        permissionsByClient
      }
    });
  });

  // POST /api/admin/clients — create or update client
  router.post("/api/admin/clients", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const body = await readJsonBody(req, config.maxJsonBytes).catch((e) => ({ __error: e?.message || "Invalid JSON" }));
    if (body?.__error) return json(res, body.__error === "Payload too large" ? 413 : 400, { error: body.__error });
    const err = validateClient(body);
    if (err) return json(res, 400, { error: err });
    const client = await upsertClient(body);
    return json(res, 200, { client });
  });

  // POST /api/admin/posts — create or update post
  router.post("/api/admin/posts", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const body = await readJsonBody(req, config.maxJsonBytes).catch((e) => ({ __error: e?.message || "Invalid JSON" }));
    if (body?.__error) return json(res, body.__error === "Payload too large" ? 413 : 400, { error: body.__error });
    const err = validatePost(body);
    if (err) return json(res, 400, { error: err });
    const post = await upsertPost(body);
    return json(res, 200, { post });
  });

  // POST /api/admin/users — create or update helper/client user
  router.post("/api/admin/users", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const body = await readJsonBody(req, config.maxJsonBytes).catch((e) => ({ __error: e?.message || "Invalid JSON" }));
    if (body?.__error) return json(res, body.__error === "Payload too large" ? 413 : 400, { error: body.__error });
    const err = validateUser(body);
    if (err) return json(res, 400, { error: err });

    const user = await upsertUser({
      id: body.id,
      email: body.email,
      name: body.name,
      role: body.role,
      disabledAt: body.disabledAt || "",
      passwordHash: body.password ? hashPassword(body.password) : body.passwordHash
    });
    return json(res, 200, {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        disabledAt: user.disabledAt || ""
      }
    });
  });

  // POST /api/admin/memberships — assign user to client with permissions
  router.post("/api/admin/memberships", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const body = await readJsonBody(req, config.maxJsonBytes).catch((e) => ({ __error: e?.message || "Invalid JSON" }));
    if (body?.__error) return json(res, body.__error === "Payload too large" ? 413 : 400, { error: body.__error });
    const err = validateMembership(body);
    if (err) return json(res, 400, { error: err });

    const state = await loadState();
    const user = state.users.find((u) => u.id === body.userId && !u.disabledAt);
    if (!user) return json(res, 404, { error: "User not found" });
    const client = state.clients.find((c) => c.id === body.clientId);
    if (!client) return json(res, 404, { error: "Client not found" });

    const membership = await upsertMembership({
      userId: body.userId,
      clientId: body.clientId,
      permissions: body.permissions
    });
    return json(res, 200, { membership });
  });

  // DELETE /api/admin/posts/:postId
  router.delete("/api/admin/posts/:postId", async (req, res, params) => {
    if (!(await requireAdmin(req, res))) return;
    if (!params.postId) return json(res, 400, { error: "postId required" });
    await deletePost(params.postId);
    return json(res, 200, { ok: true });
  });

  // DELETE /api/admin/posts/:postId/media/:mediaId
  router.delete("/api/admin/posts/:postId/media/:mediaId", async (req, res, params) => {
    if (!(await requireAdmin(req, res))) return;
    if (!params.postId || !params.mediaId) return json(res, 400, { error: "postId and mediaId required" });
    const result = await removeMedia(params.postId, params.mediaId);
    if (!result?.ok) {
      const status = result?.error === "Post not found" || result?.error === "Media not found" ? 404 : 400;
      return json(res, status, { error: result?.error || "Could not remove media" });
    }
    return json(res, 200, { ok: true, removedMediaId: params.mediaId, postId: params.postId });
  });

  // POST /api/admin/posts/:postId/media/reorder
  router.post("/api/admin/posts/:postId/media/reorder", async (req, res, params) => {
    if (!(await requireAdmin(req, res))) return;
    if (!params.postId) return json(res, 400, { error: "postId required" });
    const body = await readJsonBody(req, config.maxJsonBytes).catch((e) => ({ __error: e?.message || "Invalid JSON" }));
    if (body?.__error) return json(res, body.__error === "Payload too large" ? 413 : 400, { error: body.__error });
    if (!Array.isArray(body.mediaIds)) return json(res, 400, { error: "mediaIds array is required" });

    const post = await reorderPostMedia(params.postId, body.mediaIds);
    if (!post) return json(res, 404, { error: "Post not found" });
    return json(res, 200, { post });
  });

  // DELETE /api/admin/clients/:clientId
  router.delete("/api/admin/clients/:clientId", async (req, res, params) => {
    if (!(await requireAdmin(req, res))) return;
    if (!params.clientId) return json(res, 400, { error: "clientId required" });
    await deleteClient(params.clientId);
    return json(res, 200, { ok: true });
  });

  // POST /api/admin/media — upload media file (base64-encoded)
  router.post("/api/admin/media", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const body = await readJsonBody(req, config.maxUploadBytes).catch((e) => ({ __error: e?.message || "Invalid JSON" }));
    if (body?.__error) return json(res, body.__error === "Payload too large" ? 413 : 400, { error: body.__error });
    if (!body.postId || !body.contentBase64) return json(res, 400, { error: "postId and contentBase64 are required" });

    if (!ALLOWED_MIME_TYPES.has(body.mimeType)) {
      return json(res, 415, { error: "Unsupported media type" });
    }

    const state = await loadState();
    const post = state.posts.find((p) => p.id === body.postId);
    if (!post) return json(res, 404, { error: "Post not found" });

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

  // POST /api/admin/share-links — generate a 7-day share token for a client
  router.post("/api/admin/share-links", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const body = await readJsonBody(req, config.maxJsonBytes).catch((e) => ({ __error: e?.message || "Invalid JSON" }));
    if (body?.__error) return json(res, body.__error === "Payload too large" ? 413 : 400, { error: body.__error });
    if (!body?.clientId) return json(res, 400, { error: "clientId required" });

    const state = await loadState();
    const client = state.clients.find((c) => c.id === body.clientId);
    if (!client) return json(res, 404, { error: "Client not found" });

    const token = createAuthToken({ role: "share", clientId: client.id }, 60 * 60 * 24 * 7); // 7 days
    const link = await createShareLink(client.id, token, "");
    return json(res, 200, {
      link,
      shareUrl: `${config.appBaseUrl}#share=${encodeURIComponent(token)}`
    });
  });
}
