import crypto from "node:crypto";
import path from "node:path";

export function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

export async function readJsonBody(req, maxBytes = 5 * 1024 * 1024) {
  let raw = "";
  let size = 0;
  for await (const chunk of req) {
    raw += chunk;
    size += Buffer.byteLength(chunk || "");
    if (size > maxBytes) {
      throw new Error("Payload too large");
    }
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON body");
  }
}

export function parseUrl(req) {
  return new URL(req.url || "/", "http://localhost");
}

export function sanitizeFileName(name = "file.bin") {
  return name.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "") || "file.bin";
}

export function id() {
  return crypto.randomUUID();
}

export function now() {
  return new Date().toISOString();
}

export function pickCorsOrigin(requestOrigin, allowedOrigins = []) {
  if (!requestOrigin) return allowedOrigins[0] || "";
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : "";
}

// Returns the resolved absolute path if it's safely inside baseDir, null otherwise.
// Use this to guard against path traversal attacks.
export function validateFilePath(filePath, baseDir) {
  const absolute = path.resolve(baseDir, filePath);
  return absolute.startsWith(path.resolve(baseDir)) ? absolute : null;
}
