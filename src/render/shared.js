export const checklistKeys = ["copy", "media", "tags", "schedule", "approval"];

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function formatFriendlyDate(value = "") {
  if (!value) return "Unscheduled";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function normalizePostType(value = "") {
  const type = String(value || "").toLowerCase();
  if (type === "static") return "photo";
  if (type === "reel") return "shorts";
  if (type === "blog") return "text";
  return type || "photo";
}

export function buildMediaMap(media = []) {
  const map = new Map();
  for (const item of media) map.set(item.id, item);
  return map;
}

export function getPrimaryMedia(post, mediaMap) {
  const ids = Array.isArray(post.mediaIds) ? post.mediaIds : [];
  for (const id of ids) {
    const media = mediaMap.get(id);
    if (media?.urlPath) return media;
  }
  return null;
}

function extractGoogleDriveFileId(url = "") {
  const value = String(url || "").trim();
  if (!value) return "";
  const byPath = value.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
  if (byPath?.[1]) return byPath[1];
  const byParam = value.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (byParam?.[1]) return byParam[1];
  const byUcPath = value.match(/\/uc\?[^\s]*id=([a-zA-Z0-9_-]{20,})/);
  if (byUcPath?.[1]) return byUcPath[1];
  return "";
}

export function getGoogleDrivePreviewUrl(url = "") {
  const id = extractGoogleDriveFileId(url);
  if (!id) return "";
  return `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
}

export function renderPreviewMedia(post, mediaMap, className = "") {
  const media = getPrimaryMedia(post, mediaMap);
  const fallback = `<div class="tile-fallback">${escapeHtml((post.title || "Untitled").slice(0, 28))}</div>`;
  if (!media?.urlPath) return fallback;
  if (media?.storageMode === "external") {
    const rawUrl = String(media.urlPath || media.externalUrl || "");
    const externalUrl = escapeHtml(rawUrl);
    const provider = escapeHtml(String(media.provider || "external").replaceAll("_", " "));
    const drivePreviewUrl = String(media.provider || "") === "google_drive"
      ? getGoogleDrivePreviewUrl(rawUrl)
      : "";
    if (drivePreviewUrl) {
      return `<img src="${escapeHtml(drivePreviewUrl)}" referrerpolicy="no-referrer" alt="${escapeHtml(post.title || "External media")}" loading="lazy" class="${className}" />`;
    }
    return `
      <div class="tile-fallback">
        <span>External media (${provider})</span>
        ${externalUrl ? `<a href="${externalUrl}" target="_blank" rel="noreferrer noopener">Open source</a>` : ""}
      </div>
    `;
  }
  const url = escapeHtml(media.urlPath);
  const mime = String(media.mimeType || "").toLowerCase();
  const alt = escapeHtml(media.fileName || post.title || "Post media");
  if (mime.startsWith("image/")) {
    return `<img src="${url}" referrerpolicy="no-referrer" alt="${alt}" loading="lazy" class="${className}" />`;
  }
  if (mime.startsWith("video/")) {
    return `<video class="${className}" muted playsinline preload="metadata" referrerpolicy="no-referrer"><source src="${url}" type="${escapeHtml(mime)}" /></video>`;
  }
  return fallback;
}
