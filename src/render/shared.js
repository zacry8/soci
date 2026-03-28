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

export function renderPreviewMedia(post, mediaMap, className = "") {
  const media = getPrimaryMedia(post, mediaMap);
  const fallback = `<div class="tile-fallback">${escapeHtml((post.title || "Untitled").slice(0, 28))}</div>`;
  if (!media?.urlPath) return fallback;
  const url = escapeHtml(media.urlPath);
  const mime = String(media.mimeType || "").toLowerCase();
  const alt = escapeHtml(media.fileName || post.title || "Post media");
  if (mime.startsWith("image/")) {
    return `<img src="${url}" alt="${alt}" loading="lazy" class="${className}" />`;
  }
  if (mime.startsWith("video/")) {
    return `<video class="${className}" muted playsinline preload="metadata"><source src="${url}" type="${escapeHtml(mime)}" /></video>`;
  }
  return fallback;
}
