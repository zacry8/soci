import fs from "node:fs/promises";
import path from "node:path";
import { createAuthToken, hashPassword, verifyAuthToken } from "../auth.js";
import { addExternalMedia, addMedia, createShareLink, deleteClient, deletePost, deleteUserAndMemberships, findUserByEmail, loadState, removeMedia, reorderPostMedia, upsertClient, upsertMembership, upsertPost, upsertUser } from "../db.js";
import { sendUserInviteEmail } from "../email.js";
import { extractIcloudSharedAlbumToken, fetchIcloudSharedAlbumAssets, id, isSafeExternalMediaUrl, json, normalizeExternalProvider, readJsonBody, sanitizeFileName, validateFilePath } from "../utils.js";
import { validateClient, validateExternalMediaReference, validateMembership, validatePost, validateUser } from "../validators.js";

const OWNER_EMAILS = new Set(["zac@hommemade.xyz"]);
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

function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

function isOwnerEmail(email, config) {
  const candidate = normalizeEmail(email);
  if (!candidate) return false;
  if (OWNER_EMAILS.has(candidate)) return true;
  return candidate === normalizeEmail(config.adminEmail);
}

function toPublicUser(user = {}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name || "",
    role: user.role || "client_user",
    disabledAt: user.disabledAt || "",
    createdAt: user.createdAt || "",
    updatedAt: user.updatedAt || ""
  };
}

function buildUserStats(state) {
  const users = Array.isArray(state?.users) ? state.users : [];
  const memberships = Array.isArray(state?.memberships) ? state.memberships : [];
  const roleCounts = {
    owner_admin: 0,
    admin: 0,
    helper_staff: 0,
    client_user: 0
  };
  const membershipByUserId = memberships.reduce((acc, membership) => {
    if (!membership?.userId) return acc;
    acc[membership.userId] = (acc[membership.userId] || 0) + 1;
    return acc;
  }, {});

  let activeUsers = 0;
  let disabledUsers = 0;
  let usersWithoutMembership = 0;

  for (const user of users) {
    const role = String(user?.role || "client_user");
    if (roleCounts[role] !== undefined) roleCounts[role] += 1;
    if (user?.disabledAt) {
      disabledUsers += 1;
    } else {
      activeUsers += 1;
    }
    if (!membershipByUserId[user?.id]) usersWithoutMembership += 1;
  }

  return {
    totalUsers: users.length,
    activeUsers,
    disabledUsers,
    usersWithoutMembership,
    totalMemberships: memberships.length,
    roleCounts
  };
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

async function requireOwner(req, res, config) {
  const claims = await requireAdmin(req, res);
  if (!claims) return null;
  if (!isOwnerEmail(claims.email, config)) {
    json(res, 403, { error: "Owner-only endpoint" });
    return null;
  }
  return claims;
}

function canAssignRole(claims, targetRole = "client_user") {
  const role = String(targetRole || "client_user");
  if (role === "owner_admin") return false;
  if (role === "admin") return claims.role === "owner_admin";
  return ["helper_staff", "client_user"].includes(role);
}

export function registerAdminRoutes(router, config) {
  // GET /api/admin/state — full app state
  router.get("/api/admin/state", async (req, res) => {
    const claims = await requireAdmin(req, res);
    if (!claims) return;
    const state = await loadState();
    const permissionsByClient = Object.fromEntries(
      (state.clients || []).map((c) => [c.id, "manage"])
    );
    const ownerOnly = isOwnerEmail(claims.email, config);
    const users = (state.users || []).map(toPublicUser);
    const userStats = buildUserStats({ ...state, users });
    return json(res, 200, {
      ...state,
      users,
      userStats,
      authContext: {
        capabilities: {
          canUploadMedia: true,
          canManageUsers: true,
          canManageClients: true,
          canCreatePosts: true,
          canUseOwnerConsole: ownerOnly
        },
        permissionsByClient
      }
    });
  });

  // GET /api/admin/users — owner-only user + membership view
  router.get("/api/admin/users", async (req, res) => {
    if (!(await requireOwner(req, res, config))) return;
    const state = await loadState();
    const users = (state.users || [])
      .map(toPublicUser)
      .sort((a, b) => normalizeEmail(a.email).localeCompare(normalizeEmail(b.email)));
    return json(res, 200, {
      users,
      memberships: state.memberships || [],
      stats: buildUserStats({ ...state, users })
    });
  });

  // GET /api/admin/users/stats — owner-only user stats
  router.get("/api/admin/users/stats", async (req, res) => {
    if (!(await requireOwner(req, res, config))) return;
    const state = await loadState();
    return json(res, 200, { stats: buildUserStats(state) });
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
    const claims = await requireOwner(req, res, config);
    if (!claims) return;
    const body = await readJsonBody(req, config.maxJsonBytes).catch((e) => ({ __error: e?.message || "Invalid JSON" }));
    if (body?.__error) return json(res, body.__error === "Payload too large" ? 413 : 400, { error: body.__error });
    const err = validateUser(body);
    if (err) return json(res, 400, { error: err });

    const existingUser = body.id ? (await loadState()).users.find((value) => value.id === body.id) : null;
    const requestedRole = String(body.role || existingUser?.role || "client_user");
    if (!canAssignRole(claims, requestedRole)) {
      return json(res, 403, { error: "Insufficient privileges for requested role" });
    }
    if (existingUser?.role === "owner_admin") {
      return json(res, 403, { error: "Owner account cannot be modified via this endpoint" });
    }

    const requestedEmail = String(body.email || existingUser?.email || "").trim().toLowerCase();
    const duplicate = requestedEmail ? await findUserByEmail(requestedEmail) : null;
    if (duplicate && duplicate.id !== body.id) {
      return json(res, 409, { error: "Email already in use" });
    }

    let user;
    try {
      user = await upsertUser({
        id: body.id,
        email: body.email,
        name: body.name,
        role: body.role,
        disabledAt: body.disabledAt || "",
        passwordHash: body.password ? hashPassword(body.password) : body.passwordHash
      });
    } catch (error) {
      if (error?.code === "EMAIL_ALREADY_IN_USE") {
        return json(res, 409, { error: "Email already in use" });
      }
      throw error;
    }

    let emailSent = false;
    if (!existingUser) {
      const invite = await sendUserInviteEmail({
        to: user.email,
        name: user.name,
        inviterName: claims.email || "Admin",
        temporaryPassword: body.password || ""
      });
      emailSent = Boolean(invite?.ok);
    }

    return json(res, 200, {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        disabledAt: user.disabledAt || ""
      },
      emailSent
    });
  });

  // POST /api/admin/memberships — assign user to client with permissions
  router.post("/api/admin/memberships", async (req, res) => {
    if (!(await requireOwner(req, res, config))) return;
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

  // POST /api/admin/users/:userId/disable — owner-only
  router.post("/api/admin/users/:userId/disable", async (req, res, params) => {
    const claims = await requireOwner(req, res, config);
    if (!claims) return;
    if (!params?.userId) return json(res, 400, { error: "userId required" });

    const state = await loadState();
    const existing = state.users.find((user) => user.id === params.userId);
    if (!existing) return json(res, 404, { error: "User not found" });
    if (isOwnerEmail(existing.email, config)) {
      return json(res, 403, { error: "Cannot disable owner account" });
    }

    const user = await upsertUser({ id: existing.id, email: existing.email, disabledAt: new Date().toISOString() });
    return json(res, 200, { user: toPublicUser(user) });
  });

  // POST /api/admin/users/:userId/enable — owner-only
  router.post("/api/admin/users/:userId/enable", async (req, res, params) => {
    if (!(await requireOwner(req, res, config))) return;
    if (!params?.userId) return json(res, 400, { error: "userId required" });

    const state = await loadState();
    const existing = state.users.find((user) => user.id === params.userId);
    if (!existing) return json(res, 404, { error: "User not found" });

    const user = await upsertUser({ id: existing.id, email: existing.email, disabledAt: "" });
    return json(res, 200, { user: toPublicUser(user) });
  });

  // POST /api/admin/users/:userId/reset-password — owner-only
  router.post("/api/admin/users/:userId/reset-password", async (req, res, params) => {
    const claims = await requireOwner(req, res, config);
    if (!claims) return;
    if (!params?.userId) return json(res, 400, { error: "userId required" });

    const body = await readJsonBody(req, config.maxJsonBytes).catch((e) => ({ __error: e?.message || "Invalid JSON" }));
    if (body?.__error) return json(res, body.__error === "Payload too large" ? 413 : 400, { error: body.__error });

    const password = String(body.password || "");
    if (password.length < 8 || password.length > 200) {
      return json(res, 400, { error: "password must be between 8 and 200 characters" });
    }

    const state = await loadState();
    const existing = state.users.find((user) => user.id === params.userId);
    if (!existing) return json(res, 404, { error: "User not found" });
    if (isOwnerEmail(existing.email, config) && normalizeEmail(existing.email) !== normalizeEmail(claims.email)) {
      return json(res, 403, { error: "Cannot reset another owner account password" });
    }

    const user = await upsertUser({
      id: existing.id,
      email: existing.email,
      passwordHash: hashPassword(password)
    });
    return json(res, 200, { user: toPublicUser(user) });
  });

  // POST /api/admin/users/:userId/resend-invite — owner-only
  router.post("/api/admin/users/:userId/resend-invite", async (req, res, params) => {
    const claims = await requireOwner(req, res, config);
    if (!claims) return;
    if (!params?.userId) return json(res, 400, { error: "userId required" });

    const state = await loadState();
    const existing = state.users.find((user) => user.id === params.userId);
    if (!existing) return json(res, 404, { error: "User not found" });

    const invite = await sendUserInviteEmail({
      to: existing.email,
      name: existing.name,
      inviterName: claims.email || "Admin",
      temporaryPassword: ""
    });

    return json(res, 200, {
      ok: true,
      emailSent: Boolean(invite?.ok),
      reason: invite?.reason || ""
    });
  });

  // DELETE /api/admin/users/:userId — owner-only permanent delete (disabled users only)
  router.delete("/api/admin/users/:userId", async (req, res, params) => {
    const claims = await requireOwner(req, res, config);
    if (!claims) return;
    if (!params?.userId) return json(res, 400, { error: "userId required" });

    const state = await loadState();
    const existing = state.users.find((user) => user.id === params.userId);
    if (!existing) return json(res, 404, { error: "User not found" });
    if (isOwnerEmail(existing.email, config)) {
      return json(res, 403, { error: "Cannot delete owner account" });
    }
    if (existing.id === claims.userId) {
      return json(res, 403, { error: "Cannot delete your own account" });
    }
    if (!existing.disabledAt) {
      return json(res, 400, { error: "Disable user first before permanent delete" });
    }

    const result = await deleteUserAndMemberships(existing.id);
    return json(res, 200, result);
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

  // POST /api/admin/media/external — attach secure BYOS media reference
  router.post("/api/admin/media/external", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const body = await readJsonBody(req, config.maxJsonBytes).catch((e) => ({ __error: e?.message || "Invalid JSON" }));
    if (body?.__error) {
      const isLarge = body.__error === "Payload too large";
      return json(res, isLarge ? 413 : 400, {
        error: body.__error,
        code: isLarge ? "payload_too_large" : "invalid_json"
      });
    }

    const validationError = validateExternalMediaReference(body);
    if (validationError) {
      return json(res, 400, {
        error: validationError,
        code: "invalid_external_media_payload",
        hint: "Provide postId + a valid https externalUrl. Optional provider/displayName can also be sent."
      });
    }
    if (!isSafeExternalMediaUrl(body.externalUrl)) {
      return json(res, 400, {
        error: "externalUrl must be a safe https URL",
        code: "invalid_external_url",
        hint: "Use a public https URL. Private/local network addresses are blocked."
      });
    }

    const state = await loadState();
    const post = state.posts.find((p) => p.id === body.postId);
    if (!post) {
      return json(res, 404, {
        error: "Post not found",
        code: "post_not_found",
        hint: "Refresh state and ensure the selected post still exists."
      });
    }

    const provider = normalizeExternalProvider(body.provider, body.externalUrl);
    const displayName = String(body.displayName || "").trim().slice(0, 180)
      || `${provider === "google_drive" ? "Google Drive" : provider === "icloud" ? "iCloud" : "External"} media`;

    const media = await addExternalMedia({
      postId: body.postId,
      externalUrl: String(body.externalUrl || "").trim(),
      provider,
      displayName,
      fileName: displayName,
      mimeType: "application/octet-stream",
      nativeBookmarkHint: String(body.nativeBookmarkHint || "").trim().slice(0, 5000)
    });

    return json(res, 200, { media });
  });

  // POST /api/admin/media/icloud/album — fetch iCloud shared album assets
  router.post("/api/admin/media/icloud/album", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const body = await readJsonBody(req, config.maxJsonBytes).catch((e) => ({ __error: e?.message || "Invalid JSON" }));
    if (body?.__error) {
      const isLarge = body.__error === "Payload too large";
      return json(res, isLarge ? 413 : 400, {
        error: body.__error,
        code: isLarge ? "payload_too_large" : "invalid_json"
      });
    }

    const tokenInput = String(body?.token || body?.albumUrl || "").trim();
    const token = extractIcloudSharedAlbumToken(tokenInput);
    if (!token) {
      return json(res, 400, {
        error: "Valid iCloud shared album token or URL is required",
        code: "invalid_icloud_token",
        hint: "Paste an iCloud shared album URL like https://www.icloud.com/sharedalbum/#TOKEN"
      });
    }

    try {
      const album = await fetchIcloudSharedAlbumAssets(token);
      return json(res, 200, album);
    } catch (error) {
      const code = String(error?.code || "icloud_sync_failed");
      if (code === "invalid_icloud_token") {
        return json(res, 400, {
          error: "Invalid iCloud shared album token",
          code,
          hint: "Double-check the shared album URL and ensure it is publicly shared."
        });
      }
      if (code === "icloud_timeout") {
        return json(res, 504, {
          error: "Timed out while fetching iCloud album",
          code,
          hint: "Try again in a few seconds."
        });
      }
      return json(res, 502, {
        error: "Failed to fetch iCloud album",
        code,
        hint: "Apple may be temporarily unavailable or the shared album link may be invalid."
      });
    }
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
