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

export function extractIcloudSharedAlbumToken(input = "") {
  const value = String(input || "").trim();
  if (!value) return "";
  const safeToken = (candidate = "") => {
    const normalized = String(candidate || "").trim();
    if (!normalized) return "";
    if (!/^[A-Za-z0-9_-]{6,200}$/.test(normalized)) return "";
    return normalized;
  };
  const direct = safeToken(value);
  if (direct) return direct;
  try {
    const parsed = new URL(value);
    const hash = String(parsed.hash || "").replace(/^#/, "").trim();
    if (hash) {
      const hashToken = safeToken(hash.split("/").pop() || "");
      if (hashToken) return hashToken;
    }
    const pathToken = safeToken(parsed.pathname.split("/").pop() || "");
    if (pathToken) return pathToken;
    const queryToken = safeToken(parsed.searchParams.get("token") || "");
    return queryToken;
  } catch {
    return "";
  }
}

function buildIcloudDerivativeUrl({ host, token, derivative }) {
  if (!derivative || typeof derivative !== "object") return "";
  const directUrl = String(derivative.url || derivative.url_location || derivative.urlLocation || "").trim();
  if (/^https:\/\//i.test(directUrl)) return directUrl;
  if (directUrl && host) {
    const normalizedPath = directUrl.startsWith("/") ? directUrl : `/${directUrl}`;
    return `https://${host}${normalizedPath}`;
  }
  const checksum = String(derivative.checksum || "").trim();
  if (!checksum || !host || !token) return "";
  return `https://${host}/${token}/sharedstreams/webserver/${checksum}`;
}

function pickIcloudDerivative(derivatives = {}, preferredSizes = []) {
  for (const key of preferredSizes) {
    const match = derivatives?.[key];
    if (match && typeof match === "object") return match;
  }
  const fallback = Object.values(derivatives || {}).find((value) => value && typeof value === "object");
  return fallback || null;
}

export async function fetchIcloudSharedAlbumAssets(token, { timeoutMs = 9000 } = {}) {
  const normalizedToken = extractIcloudSharedAlbumToken(token);
  if (!normalizedToken) {
    const error = new Error("Invalid iCloud shared album token");
    error.code = "invalid_icloud_token";
    throw error;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const appleUrl = `https://p23-sharedstreams.icloud.com/${normalizedToken}/sharedstreams/webserver/get_album_main`;

  try {
    const response = await fetch(appleUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      signal: controller.signal
    });
    if (!response.ok) {
      const error = new Error(`Apple iCloud request failed (${response.status})`);
      error.code = "icloud_upstream_failed";
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    const host = String(payload?.stream_base_url || payload?.streamBaseUrl || "").trim();
    const photos = Array.isArray(payload?.photos) ? payload.photos : [];
    const assets = photos.map((photo, index) => {
      const derivatives = photo?.derivatives && typeof photo.derivatives === "object" ? photo.derivatives : {};
      const thumbDerivative = pickIcloudDerivative(derivatives, ["640", "1024", "2048"]);
      const fullDerivative = pickIcloudDerivative(derivatives, ["2048", "1024", "640"]);
      const thumbUrl = buildIcloudDerivativeUrl({ host, token: normalizedToken, derivative: thumbDerivative });
      const fullUrl = buildIcloudDerivativeUrl({ host, token: normalizedToken, derivative: fullDerivative });
      const fallback = fullUrl || thumbUrl;
      return {
        id: String(photo?.photoGuid || photo?.guid || `icloud-${index}`),
        thumbUrl: thumbUrl || fallback,
        fullUrl: fullUrl || fallback,
        createdAt: String(photo?.dateCreated || photo?.dateCreatedUTC || photo?.createdAt || "")
      };
    }).filter((asset) => asset.fullUrl || asset.thumbUrl);

    return { token: normalizedToken, host, assets };
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("Apple iCloud request timed out");
      timeoutError.code = "icloud_timeout";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
