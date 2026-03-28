import { sortByProfileOrder } from "./store.js";

export function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function formatFriendlyDate(value = "") {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function getShareToken() {
  const hash = location.hash.replace(/^#/, "");
  if (!hash.startsWith("share=")) return "";
  try {
    return decodeURIComponent(hash.slice(6));
  } catch {
    return "";
  }
}

export function toClientSharePosts(state, clientId) {
  return sortByProfileOrder(state.posts).filter((post) => post.clientId === clientId && post.visibility === "client-shareable" && post.scheduleDate);
}

export function listAssignees(posts) {
  return [...new Set(posts.map((p) => (p.assignee || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function collectHashtagSuggestions(posts) {
  const counts = new Map();
  for (const post of posts) {
    const fromTags = Array.isArray(post.tags) ? post.tags : [];
    for (const tag of fromTags) {
      const normalized = String(tag || "").trim().toLowerCase().replace(/^#/, "");
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }
    const caption = String(post.caption || "");
    const hashMatches = [...caption.matchAll(/#([a-z0-9_]+)/gi)].map((match) => match[1].toLowerCase());
    for (const hash of hashMatches) {
      counts.set(hash, (counts.get(hash) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
