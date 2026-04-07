import crypto from "node:crypto";
import net from "node:net";
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

function isPrivateOrLocalHost(hostname = "") {
  const host = String(hostname || "").trim().toLowerCase();
  if (!host) return true;
  if (host === "localhost" || host === "::1" || host.endsWith(".local")) return true;

  const ipType = net.isIP(host);
  if (ipType === 4) {
    const parts = host.split(".").map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    return false;
  }

  if (ipType === 6) {
    if (host === "::1") return true;
    if (host.startsWith("fc") || host.startsWith("fd")) return true; // ULA fc00::/7
    if (host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb")) return true; // link-local fe80::/10
    return false;
  }

  return false;
}

export function isSafeExternalMediaUrl(value = "") {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return false;
    if (url.username || url.password) return false;
    if (isPrivateOrLocalHost(url.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export function detectExternalMediaProvider(value = "") {
  let host = "";
  try {
    host = new URL(String(value || "")).hostname.toLowerCase();
  } catch {
    return "direct";
  }
  if (host.includes("drive.google.com") || host.includes("googleusercontent.com")) return "google_drive";
  if (host.includes("icloud.com")) return "icloud";
  if (host.includes("dropbox.com") || host.includes("dropboxusercontent.com")) return "dropbox";
  if (host.includes("onedrive.live.com") || host.includes("1drv.ms")) return "onedrive";
  return "direct";
}

export function normalizeExternalProvider(value = "", fallbackUrl = "") {
  const normalized = String(value || "").trim().toLowerCase();
  const allowed = new Set(["google_drive", "icloud", "dropbox", "onedrive", "direct"]);
  if (allowed.has(normalized)) return normalized;
  return detectExternalMediaProvider(fallbackUrl);
}
