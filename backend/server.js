import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { config } from "./config.js";
import { createAuthToken, verifyAuthToken } from "./auth.js";
import { addMedia, createShareLink, deleteClient, deletePost, loadState, upsertClient, upsertPost } from "./db.js";
import { id, json, now, parseUrl, pickCorsOrigin, readJsonBody, sanitizeFileName } from "./utils.js";

// ── Startup validation ────────────────────────────────────────────────────────
if (config.authSecret === "replace-this-in-production") {
  throw new Error("[soci] AUTH_SECRET is still the default. Set a strong secret in .env (copy .env.example).");
}
if (config.adminPassword === "change-me-now") {
  throw new Error("[soci] ADMIN_PASSWORD is still the default. Set a strong password in .env (copy .env.example).");
}

// ── Rate limiting (login endpoint) ────────────────────────────────────────────
const loginAttempts = new Map();
const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 min
const RATE_MAX = 10;

function isRateLimited(ip) {
  const now = Date.now();
  let entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW_MS };
  }
  entry.count++;
  loginAttempts.set(ip, entry);
  return entry.count > RATE_MAX;
}

// ── Magic bytes validation ────────────────────────────────────────────────────
function checkMagicBytes(buf, mimeType) {
  if (buf.length < 12) return false;
  if (mimeType === "image/jpeg") return buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
  if (mimeType === "image/png")  return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  if (mimeType === "image/gif")  return buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38;
  if (mimeType === "image/webp") {
    return buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && // RIFF
           buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;  // WEBP
  }
  if (mimeType === "video/mp4" || mimeType === "video/quicktime") {
    return buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70; // ftyp
  }
  if (mimeType === "video/webm") return buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3;
  if (mimeType === "application/pdf") return buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46; // %PDF
  return false;
}

// ── Allowed MIME types ────────────────────────────────────────────────────────
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "video/mp4", "video/quicktime", "video/webm",
  "application/pdf",
]);

// ── Input validation ──────────────────────────────────────────────────────────
function validateClient(body) {
  if (!body.id && (typeof body.name !== "string" || !body.name.trim()))
    return "name is required";
  if (body.name !== undefined && (typeof body.name !== "string" || body.name.length > 100))
    return "name must be a string up to 100 characters";
  if (body.channels !== undefined && (
    !Array.isArray(body.channels) || body.channels.length > 20 ||
    body.channels.some(c => typeof c !== "string" || c.length > 50)
  )) return "channels must be an array of up to 20 strings (max 50 chars each)";
  if (body.shareSlug !== undefined && (typeof body.shareSlug !== "string" || body.shareSlug.length > 100))
    return "shareSlug must be a string up to 100 characters";
  if (body.sharingEnabled !== undefined && typeof body.sharingEnabled !== "boolean")
    return "sharingEnabled must be a boolean";
  return null;
}

const VALID_STATUSES = new Set([
  "idea",
  "in-progress",
  "in-review",
  "ready",
  // legacy/back-compat values
  "draft",
  "scheduled",
  "published"
]);
const VALID_VISIBILITIES = new Set(["client-shareable", "internal"]);

function validatePost(body) {
  if (!body.id && !body.clientId) return "clientId is required";
  if (body.title !== undefined && (typeof body.title !== "string" || body.title.length > 200))
    return "title must be a string up to 200 characters";
  if (body.caption !== undefined && (typeof body.caption !== "string" || body.caption.length > 10000))
    return "caption must be a string up to 10,000 characters";
  if (body.tags !== undefined && (
    !Array.isArray(body.tags) || body.tags.length > 30 ||
    body.tags.some(t => typeof t !== "string" || t.length > 100)
  )) return "tags must be an array of up to 30 strings (max 100 chars each)";
  if (body.platforms !== undefined && (
    !Array.isArray(body.platforms) || body.platforms.length > 20 ||
    body.platforms.some(p => typeof p !== "string" || p.length > 50)
  )) return "platforms must be an array of up to 20 strings (max 50 chars each)";
  if (body.status !== undefined && !VALID_STATUSES.has(body.status))
    return `status must be one of: ${[...VALID_STATUSES].join(", ")}`;
  if (body.visibility !== undefined && !VALID_VISIBILITIES.has(body.visibility))
    return `visibility must be one of: ${[...VALID_VISIBILITIES].join(", ")}`;
  return null;
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
async function requireAdmin(req, res) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const claims = verifyAuthToken(token);
  if (!claims || claims.role !== "admin") {
    json(res, 401, { error: "Unauthorized" });
    return null;
  }
  return claims;
}

// ── Security headers ──────────────────────────────────────────────────────────
function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Referrer-Policy", "no-referrer");
}

// ── Server ────────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = parseUrl(req);
  const { pathname } = url;
  const origin = req.headers.origin || "";
  const allowedOrigin = pickCorsOrigin(origin, config.corsOrigins);

  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  setSecurityHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  // ── Health ──────────────────────────────────────────────────────────────────
  if (req.method === "GET" && pathname === "/health") {
    return json(res, 200, { ok: true, service: "soci-api", time: now() });
  }

  // ── Login ───────────────────────────────────────────────────────────────────
  if (req.method === "POST" && pathname === "/api/auth/login") {
    const ip = req.socket.remoteAddress || "unknown";
    if (isRateLimited(ip)) {
      return json(res, 429, { error: "Too many login attempts. Try again in 15 minutes." });
    }
    const body = await readJsonBody(req, config.maxJsonBytes).catch((e) => ({ __error: e?.message || "Invalid JSON" }));
    if (body?.__error) {
      return json(res, body.__error === "Payload too large" ? 413 : 400, { error: body.__error });
    }

    // Timing-safe comparison for both fields
    const emailBuf    = Buffer.alloc(256);
    const passBuf     = Buffer.alloc(256);
    const emailExpBuf = Buffer.alloc(256);
    const passExpBuf  = Buffer.alloc(256);
    emailBuf.write(String(body.email || "").slice(0, 255));
    passBuf.write(String(body.password || "").slice(0, 255));
    emailExpBuf.write(config.adminEmail.slice(0, 255));
    passExpBuf.write(config.adminPassword.slice(0, 255));
    const emailOk = crypto.timingSafeEqual(emailBuf, emailExpBuf);
    const passOk  = crypto.timingSafeEqual(passBuf, passExpBuf);

    if (!emailOk || !passOk) {
      return json(res, 401, { error: "Invalid credentials" });
    }
    const token = createAuthToken({ role: "admin", email: config.adminEmail });
    return json(res, 200, { token, role: "admin" });
  }

  // ── Admin: state ────────────────────────────────────────────────────────────
  if (req.method === "GET" && pathname === "/api/admin/state") {
    if (!(await requireAdmin(req, res))) return;
    const state = await loadState();
    return json(res, 200, state);
  }

  // ── Admin: upsert client ────────────────────────────────────────────────────
  if (req.method === "POST" && pathname === "/api/admin/clients") {
    if (!(await requireAdmin(req, res))) return;
    const body = await readJsonBody(req, config.maxJsonBytes).catch((e) => ({ __error: e?.message || "Invalid JSON" }));
    if (body?.__error) return json(res, body.__error === "Payload too large" ? 413 : 400, { error: body.__error });
    const err = validateClient(body);
    if (err) return json(res, 400, { error: err });
    const client = await upsertClient(body);
    return json(res, 200, { client });
  }

  // ── Admin: upsert post ──────────────────────────────────────────────────────
  if (req.method === "POST" && pathname === "/api/admin/posts") {
    if (!(await requireAdmin(req, res))) return;
    const body = await readJsonBody(req, config.maxJsonBytes).catch((e) => ({ __error: e?.message || "Invalid JSON" }));
    if (body?.__error) return json(res, body.__error === "Payload too large" ? 413 : 400, { error: body.__error });
    const err = validatePost(body);
    if (err) return json(res, 400, { error: err });
    const post = await upsertPost(body);
    return json(res, 200, { post });
  }

  // ── Admin: delete post ──────────────────────────────────────────────────────
  if (req.method === "DELETE" && pathname.startsWith("/api/admin/posts/")) {
    if (!(await requireAdmin(req, res))) return;
    const postId = pathname.slice("/api/admin/posts/".length);
    if (!postId) return json(res, 400, { error: "postId required" });
    await deletePost(postId);
    return json(res, 200, { ok: true });
  }

  // ── Admin: delete client ────────────────────────────────────────────────────
  if (req.method === "DELETE" && pathname.startsWith("/api/admin/clients/")) {
    if (!(await requireAdmin(req, res))) return;
    const clientId = pathname.slice("/api/admin/clients/".length);
    if (!clientId) return json(res, 400, { error: "clientId required" });
    await deleteClient(clientId);
    return json(res, 200, { ok: true });
  }

  // ── Admin: upload media ─────────────────────────────────────────────────────
  if (req.method === "POST" && pathname === "/api/admin/media") {
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
      return json(res, 415, { error: "File content does not match declared type" });
    }

    await fs.mkdir(config.uploadDir, { recursive: true });
    const safeName = sanitizeFileName(body.fileName || "media.bin");
    const ext = path.extname(safeName) || ".bin";
    const fileName = `${id()}${ext}`;
    const absolute = path.join(config.uploadDir, fileName);

    // Guard: ensure resolved path stays within uploadDir
    if (!absolute.startsWith(path.resolve(config.uploadDir))) {
      return json(res, 400, { error: "Invalid file path" });
    }

    await fs.writeFile(absolute, bytes);
    const media = await addMedia({
      postId: body.postId,
      fileName: safeName,
      mimeType: body.mimeType,
      sizeBytes: bytes.length,
      urlPath: `/uploads/${fileName}`
    });
    return json(res, 200, { media, publicUrl: `${config.apiBaseUrl}${media.urlPath}` });
  }

  // ── Admin: create share link ────────────────────────────────────────────────
  if (req.method === "POST" && pathname === "/api/admin/share-links") {
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
  }

  // ── Share: calendar (token via Authorization header, not URL) ───────────────
  if (req.method === "GET" && pathname === "/api/share/calendar") {
    const auth = req.headers.authorization || "";
    const shareToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const claims = verifyAuthToken(shareToken);
    if (!claims || claims.role !== "share" || !claims.clientId) {
      return json(res, 401, { error: "Invalid share token" });
    }

    // Verify token exists in db and is not revoked
    const state = await loadState();
    const linkRecord = state.shareLinks.find(
      (l) => l.token === shareToken && l.clientId === claims.clientId && !l.revokedAt
    );
    if (!linkRecord) return json(res, 401, { error: "Share token revoked or not found" });

    const client = state.clients.find((c) => c.id === claims.clientId);
    if (!client) return json(res, 404, { error: "Client not found" });
    const posts = state.posts.filter((p) => p.clientId === client.id && p.visibility === "client-shareable");
    return json(res, 200, { client, posts });
  }

  // ── Uploads: serve files ────────────────────────────────────────────────────
  if (req.method === "GET" && pathname.startsWith("/uploads/")) {
    const fileName = path.basename(pathname.replace("/uploads/", ""));
    const absolute = path.join(config.uploadDir, fileName);

    // Guard: ensure resolved path stays within uploadDir
    if (!absolute.startsWith(path.resolve(config.uploadDir))) {
      return json(res, 400, { error: "Invalid file path" });
    }

    try {
      const data = await fs.readFile(absolute);
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": data.length,
        "Content-Disposition": "attachment",
      });
      return res.end(data);
    } catch {
      return json(res, 404, { error: "File not found" });
    }
  }

  return json(res, 404, { error: "Not found" });
});

server.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[soci-api] listening on http://localhost:${config.port}`);
});
