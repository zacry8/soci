import { checklistKeys } from "../shared.js";

export function readinessFor(post) {
  const checklistDone = checklistKeys.filter((key) => post?.checklist?.[key]).length;
  const scheduleDate = String(post?.scheduleDate || "").trim();
  const mediaCount = Array.isArray(post?.mediaIds) ? post.mediaIds.length : 0;
  const postType = String(post?.postType || "photo").toLowerCase();
  const needsMedia = postType !== "text";
  const blocked = [];

  if (!post?.clientId) blocked.push("Assign workspace");
  if ((post?.status === "in-review" || post?.status === "ready") && !scheduleDate) blocked.push("Missing schedule date");
  if (post?.status === "ready" && !post?.checklist?.approval) blocked.push("Needs approval");
  if (needsMedia && mediaCount === 0) blocked.push("Missing media");

  const readiness = Math.max(
    0,
    Math.min(
      100,
      Math.round((checklistDone / checklistKeys.length) * 70 + (scheduleDate ? 15 : 0) + (mediaCount > 0 || !needsMedia ? 15 : 0))
    )
  );

  return { readiness, blocked, mediaCount };
}

function compareValues(a, b, sortKey) {
  if (sortKey === "readiness") return readinessFor(a).readiness - readinessFor(b).readiness;
  if (sortKey === "scheduleDate") return String(a.scheduleDate || "").localeCompare(String(b.scheduleDate || ""));
  if (sortKey === "updatedAt") return String(a.updatedAt || "").localeCompare(String(b.updatedAt || ""));
  if (sortKey === "assignee") return String(a.assignee || "").localeCompare(String(b.assignee || ""));
  if (sortKey === "status") return String(a.status || "").localeCompare(String(b.status || ""));
  return String(a.title || "").localeCompare(String(b.title || ""));
}

export function sortedPosts(posts, sort) {
  const key = sort?.key || "scheduleDate";
  const direction = sort?.direction === "desc" ? -1 : 1;
  return [...posts].sort((a, b) => {
    const primary = compareValues(a, b, key) * direction;
    if (primary) return primary;
    return String(a.title || "").localeCompare(String(b.title || ""));
  });
}

export function sortMarker(currentSort, key) {
  if (currentSort?.key !== key) return "";
  return currentSort?.direction === "desc" ? "↓" : "↑";
}

export function toTableRows(posts, sort) {
  return sortedPosts(posts, sort).map((post) => {
    const { readiness, blocked, mediaCount } = readinessFor(post);
    return {
      id: post.id,
      post,
      readiness,
      mediaCount,
      blockedText: blocked.length ? blocked.join(" • ") : "Clear"
    };
  });
}
