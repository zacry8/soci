import { CHECKLIST_LABELS, STATUSES, STATUS_LABELS } from "../data.js";
import { buildMediaMap, escapeHtml, formatFriendlyDate, getGoogleDrivePreviewUrl, getPrimaryMedia } from "./shared.js";

const checklistKeys = Object.keys(CHECKLIST_LABELS);

function makeCard(cardTpl, post, onOpen, onDropStatus, options = {}) {
  const showThumbnail = options.showThumbnail !== false;
  const showMeta = options.showMeta !== false;
  const showExcerpt = options.showExcerpt !== false;
  const mediaMap = options.mediaMap || new Map();
  const card = cardTpl.content.firstElementChild.cloneNode(true);
  card.dataset.id = post.id;
  const title = card.querySelector("h4");
  const meta = card.querySelector(".meta");
  const excerpt = card.querySelector(".excerpt");
  title.textContent = post.title;
  meta.textContent = `${post.platforms.join(", ")} • ${formatFriendlyDate(post.scheduleDate)}`;
  excerpt.textContent = post.caption.slice(0, 90) || "No caption yet.";

  card.classList.toggle("hide-card-meta", !showMeta);
  card.classList.toggle("hide-card-excerpt", !showExcerpt);

  if (showThumbnail) {
    const primaryMedia = getPrimaryMedia(post, mediaMap);
    if (primaryMedia?.urlPath) {
      const thumb = document.createElement("div");
      thumb.className = "card-thumb";
      if (primaryMedia?.storageMode === "external") {
        const providerRaw = String(primaryMedia.provider || "external");
        const provider = providerRaw.replaceAll("_", " ");
        if (providerRaw === "google_drive") {
          const previewUrl = getGoogleDrivePreviewUrl(primaryMedia.urlPath || primaryMedia.externalUrl || "");
          if (previewUrl) {
            thumb.innerHTML = `<img src="${escapeHtml(previewUrl)}" referrerpolicy="no-referrer" alt="${escapeHtml(post.title || "External media")}" loading="lazy"/>`;
          } else {
            thumb.innerHTML = `<div class="tile-fallback">External media (${provider})</div>`;
          }
        } else if (providerRaw === "icloud") {
          const previewUrl = String(primaryMedia.thumbnailUrl || primaryMedia.urlPath || primaryMedia.externalUrl || "").trim();
          if (previewUrl) {
            thumb.innerHTML = `<img src="${escapeHtml(previewUrl)}" referrerpolicy="no-referrer" alt="${escapeHtml(post.title || "iCloud media")}" loading="lazy"/>`;
          } else {
            thumb.innerHTML = `<div class="tile-fallback">External media (${provider})</div>`;
          }
        } else {
          thumb.innerHTML = `<div class="tile-fallback">External media (${provider})</div>`;
        }
      } else {
        const mimeType = String(primaryMedia.mimeType || "").toLowerCase();
        if (mimeType.startsWith("video/")) {
          thumb.innerHTML = `<video muted playsinline preload="metadata" src="${primaryMedia.urlPath}"></video>`;
        } else {
          thumb.innerHTML = `<img src="${primaryMedia.urlPath}" alt="${post.title || "Post media"}" loading="lazy"/>`;
        }
      }
      title.before(thumb);
    }
  }

  const badge = card.querySelector(".card-badge");
  badge.textContent = post.publishState === "published" ? "Published" : post.publishState === "scheduled" ? "Scheduled" : "Draft";
  badge.className = `card-badge ${post.publishState}`;

  const done = checklistKeys.filter((key) => post.checklist[key]).length;
  const readyPercent = Math.round((done / checklistKeys.length) * 100);
  card.querySelector(".card-progress").innerHTML = `<span class="card-progress-mini"><span class="card-progress-mini-fill" style="width:${readyPercent}%"></span></span><span>${done}/${checklistKeys.length} ready</span>`;

  card.addEventListener("click", () => onOpen(post.id));
  card.addEventListener("dragstart", () => card.classList.add("dragging"));
  card.addEventListener("dragend", () => card.classList.remove("dragging"));
  card.addEventListener("drop", (event) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/id");
    onDropStatus(id, post.status);
  });
  card.addEventListener("dragover", (event) => event.preventDefault());
  card.addEventListener("dragstart", (event) => {
    event.dataTransfer.setData("text/id", post.id);
    event.dataTransfer.setData("application/x-soci-post", JSON.stringify({ id: post.id }));
  });
  return card;
}

export function renderKanban(root, posts, onOpen, onDropStatus, options = {}) {
  const columnTpl = document.querySelector("#column-template");
  const cardTpl = document.querySelector("#card-template");
  const mediaMap = buildMediaMap(options.media || []);
  root.innerHTML = "";

  if (posts.length === 0) {
    const empty = document.createElement("div");
    empty.className = "kanban-empty";
    empty.innerHTML = `
      <p class="kanban-empty-headline">No posts yet</p>
      <p>Click <strong>+ New Post</strong> in the sidebar to create your first post.</p>
      ${typeof options?.onQuickAdd === "function" ? `<button type="button" class="small kanban-quick-add" data-quick-add-status="idea">+ Quick add draft</button>` : ""}`;
    root.append(empty);
    empty.querySelector("[data-quick-add-status]")?.addEventListener("click", async () => {
      await options.onQuickAdd?.("idea");
    });
    return;
  }

  for (const status of STATUSES) {
    const col = columnTpl.content.firstElementChild.cloneNode(true);
    col.dataset.status = status;
    col.querySelector("h3").textContent = STATUS_LABELS[status];
    const list = posts.filter((post) => post.status === status);
    col.querySelector(".count").textContent = String(list.length);
    const cards = col.querySelector(".cards");

    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-lane";
      empty.innerHTML = `No posts yet${typeof options?.onQuickAdd === "function" ? `<button type="button" class="small lane-quick-add" data-quick-add-status="${status}">+ Quick add</button>` : ""}`;
      cards.append(empty);
      empty.querySelector("[data-quick-add-status]")?.addEventListener("click", async () => {
        await options.onQuickAdd?.(status);
      });
    } else {
      for (const post of list) {
        cards.append(makeCard(cardTpl, post, onOpen, onDropStatus, { ...options, mediaMap }));
      }
    }

    col.addEventListener("dragover", (event) => event.preventDefault());
    col.addEventListener("drop", (event) => {
      event.preventDefault();
      const id = event.dataTransfer.getData("text/id");
      onDropStatus(id, status);
    });
    root.append(col);
  }
}
