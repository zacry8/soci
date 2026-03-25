import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { config } from "./config.js";
import { createAuthToken, verifyAuthToken } from "./auth.js";
import { addMedia, createShareLink, loadState, upsertClient, upsertPost } from "./db.js";
import { id, json, now, parseUrl, pickCorsOrigin, readJsonBody, sanitizeFileName } from "./utils.js";

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

function matchSharePath(pathname) {
  const m = pathname.match(/^\/api\/share\/([^/]+)\/calendar$/);
  return m ? m[1] : "";
}

const server = http.createServer(async (req, res) => {
  const url = parseUrl(req);
  const { pathname } = url;
  const origin = req.headers.origin || "";
  const allowedOrigin = pickCorsOrigin(origin, config.corsOrigins);

  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === "GET" && pathname === "/health") {
    return json(res, 200, { ok: true, service: "soci-api", time: now() });
  }

  if (req.method === "POST" && pathname === "/api/auth/login") {
    const body = await readJsonBody(req, config.maxJsonBytes).catch((error) => ({ __error: error?.message || "Invalid JSON" }));
    if (body?.__error) {
      return json(res, body.__error === "Payload too large" ? 413 : 400, { error: body.__error });
    }
    if (body.email !== config.adminEmail || body.password !== config.adminPassword) {
      return json(res, 401, { error: "Invalid credentials" });
    }
    const token = createAuthToken({ role: "admin", email: config.adminEmail });
    return json(res, 200, { token, role: "admin" });
  }

  if (req.method === "GET" && pathname === "/api/admin/state") {
    if (!(await requireAdmin(req, res))) return;
    const state = await loadState();
    return json(res, 200, state);
  }

  if (req.method === "POST" && pathname === "/api/admin/clients") {
    if (!(await requireAdmin(req, res))) return;
    const body = await readJsonBody(req, config.maxJsonBytes).catch((error) => ({ __error: error?.message || "Invalid JSON" }));
    if (body?.__error) {
      return json(res, body.__error === "Payload too large" ? 413 : 400, { error: body.__error });
    }
    const client = await upsertClient(body);
    return json(res, 200, { client });
  }

  if (req.method === "POST" && pathname === "/api/admin/posts") {
    if (!(await requireAdmin(req, res))) return;
    const body = await readJsonBody(req, config.maxJsonBytes).catch((error) => ({ __error: error?.message || "Invalid JSON" }));
    if (body?.__error) {
      return json(res, body.__error === "Payload too large" ? 413 : 400, { error: body.__error });
    }
    const post = await upsertPost(body);
    return json(res, 200, { post });
  }

  if (req.method === "POST" && pathname === "/api/admin/media") {
    if (!(await requireAdmin(req, res))) return;
    const body = await readJsonBody(req, config.maxUploadBytes).catch((error) => ({ __error: error?.message || "Invalid JSON" }));
    if (body?.__error) {
      return json(res, body.__error === "Payload too large" ? 413 : 400, { error: body.__error });
    }
    if (!body.postId || !body.contentBase64) return json(res, 400, { error: "postId and contentBase64 are required" });

    const ALLOWED_MIME_TYPES = new Set([
      "image/jpeg", "image/png", "image/gif", "image/webp",
      "video/mp4", "video/quicktime", "video/webm",
      "application/pdf",
    ]);
    if (!ALLOWED_MIME_TYPES.has(body.mimeType)) {
      return json(res, 415, { error: "Unsupported media type" });
    }

    const state = await loadState();
    const post = state.posts.find((p) => p.id === body.postId);
    if (!post) return json(res, 404, { error: "Post not found" });

    await fs.mkdir(config.uploadDir, { recursive: true });
    const safeName = sanitizeFileName(body.fileName || "media.bin");
    const ext = path.extname(safeName) || ".bin";
    const fileName = `${id()}${ext}`;
    const absolute = path.join(config.uploadDir, fileName);
    const bytes = Buffer.from(body.contentBase64, "base64");
    await fs.writeFile(absolute, bytes);

    const media = await addMedia({
      postId: body.postId,
      fileName: safeName,
      mimeType: body.mimeType || "application/octet-stream",
      sizeBytes: bytes.length,
      urlPath: `/uploads/${fileName}`
    });
    return json(res, 200, { media, publicUrl: `${config.apiBaseUrl}${media.urlPath}` });
  }

  if (req.method === "POST" && pathname === "/api/admin/share-links") {
    if (!(await requireAdmin(req, res))) return;
    const body = await readJsonBody(req, config.maxJsonBytes).catch((error) => ({ __error: error?.message || "Invalid JSON" }));
    if (body?.__error) {
      return json(res, body.__error === "Payload too large" ? 413 : 400, { error: body.__error });
    }
    if (!body?.clientId) return json(res, 400, { error: "clientId required" });
    const state = await loadState();
    const client = state.clients.find((c) => c.id === body.clientId);
    if (!client) return json(res, 404, { error: "Client not found" });

    const token = createAuthToken({ role: "share", clientId: client.id }, 60 * 60 * 24 * 30);
    const link = await createShareLink(client.id, token, "");
    return json(res, 200, {
      link,
      shareUrl: `${config.appBaseUrl}#share=${encodeURIComponent(token)}`
    });
  }

  const shareToken = matchSharePath(pathname);
  if (req.method === "GET" && shareToken) {
    const claims = verifyAuthToken(shareToken);
    if (!claims || claims.role !== "share" || !claims.clientId) return json(res, 401, { error: "Invalid share token" });
    const state = await loadState();
    const client = state.clients.find((c) => c.id === claims.clientId);
    if (!client) return json(res, 404, { error: "Client not found" });
    const posts = state.posts.filter((p) => p.clientId === client.id && p.visibility === "client-shareable");
    return json(res, 200, { client, posts });
  }

  if (req.method === "GET" && pathname.startsWith("/uploads/")) {
    const fileName = pathname.replace("/uploads/", "");
    const absolute = path.join(config.uploadDir, path.basename(fileName));
    try {
      const data = await fs.readFile(absolute);
      res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": data.length });
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
