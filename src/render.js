import { CHECKLIST_LABELS, PLATFORM_OPTIONS, STATUSES, STATUS_LABELS } from "./data.js";

const checklistKeys = ["copy", "media", "tags", "schedule", "approval"];
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/pdf"
]);
// Backend default MAX_UPLOAD_BYTES is 12MB for JSON payload. Because uploads are base64-in-JSON,
// practical binary-safe max is lower. Keep a conservative client-side cap to avoid surprise 413s.
const SAFE_MAX_BINARY_UPLOAD_BYTES = 9 * 1024 * 1024;

function escapeHtml(value = "") {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function withDownloadParam(url = "") {
  if (!url) return "";
  return url.includes("?") ? `${url}&download=1` : `${url}?download=1`;
}

function extractHashtags(caption = "") {
  return [...String(caption || "").matchAll(/#([a-z0-9_]+)/gi)].map((match) => match[1].toLowerCase());
}

function renderPrimaryMediaPreview(media) {
  if (!media?.urlPath) return `<span class="safe-zone">Media preview</span>`;
  const url = escapeHtml(media.urlPath);
  const name = escapeHtml(media.fileName || "media");
  const mime = String(media.mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) {
    return `<img src="${url}" alt="${name}" loading="lazy" decoding="async" class="media-preview-img"/>`;
  }
  if (mime.startsWith("video/")) {
    return `<video controls preload="metadata" class="media-preview-video"><source src="${url}" type="${escapeHtml(mime)}"/>Your browser does not support video preview.</video>`;
  }
  return `<a href="${url}" target="_blank" rel="noreferrer">${name}</a>`;
}

function iconWithLabel(icon, label, value = "") {
  const safeLabel = escapeHtml(label);
  const safeValue = escapeHtml(value);
  return `<span class="social-pill"><i data-lucide="${escapeHtml(icon)}" aria-hidden="true"></i><span>${safeLabel}${safeValue ? ` ${safeValue}` : ""}</span></span>`;
}

// ── Kanban ───────────────────────────────────────────────────────────────────

function makeCard(cardTpl, post, onOpen, onDropStatus) {
  const card = cardTpl.content.firstElementChild.cloneNode(true);
  card.dataset.id = post.id;
  card.querySelector("h4").textContent = post.title;
  card.querySelector(".meta").textContent = `${post.platforms.join(", ")} • ${post.scheduleDate || "Unscheduled"}`;
  card.querySelector(".excerpt").textContent = post.caption.slice(0, 90) || "No caption yet.";

  // Publish state badge
  const badge = card.querySelector(".card-badge");
  badge.textContent = post.publishState === "published" ? "Published" : post.publishState === "scheduled" ? "Scheduled" : "Draft";
  badge.className = `card-badge ${post.publishState}`;

  // Checklist progress
  const done = checklistKeys.filter((k) => post.checklist[k]).length;
  card.querySelector(".card-progress").textContent = `${done}/${checklistKeys.length} ready`;

  card.addEventListener("click", () => onOpen(post.id));
  card.addEventListener("dragstart", () => card.classList.add("dragging"));
  card.addEventListener("dragend", () => card.classList.remove("dragging"));
  card.addEventListener("drop", (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/id");
    onDropStatus(id, post.status);
  });
  card.addEventListener("dragover", (e) => e.preventDefault());
  card.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/id", post.id));
  return card;
}

export function renderKanban(root, posts, onOpen, onDropStatus) {
  const columnTpl = document.querySelector("#column-template");
  const cardTpl = document.querySelector("#card-template");
  root.innerHTML = "";

  for (const status of STATUSES) {
    const col = columnTpl.content.firstElementChild.cloneNode(true);
    col.dataset.status = status;
    col.querySelector("h3").textContent = STATUS_LABELS[status];
    const list = posts.filter((p) => p.status === status);
    col.querySelector(".count").textContent = String(list.length);
    const cards = col.querySelector(".cards");

    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-lane";
      empty.textContent = "No posts yet";
      cards.append(empty);
    } else {
      for (const post of list) cards.append(makeCard(cardTpl, post, onOpen, onDropStatus));
    }

    col.addEventListener("dragover", (e) => e.preventDefault());
    col.addEventListener("drop", (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/id");
      onDropStatus(id, status);
    });
    root.append(col);
  }
}

// ── Calendar ─────────────────────────────────────────────────────────────────

export function renderCalendar(root, posts, onOpen, offset = 0, onOffsetChange) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + offset;
  const target = new Date(year, month, 1);
  const displayYear = target.getFullYear();
  const displayMonth = target.getMonth();
  const first = new Date(displayYear, displayMonth, 1).getDay();
  const days = new Date(displayYear, displayMonth + 1, 0).getDate();
  const total = 35;

  const monthLabel = target.toLocaleString("default", { month: "long", year: "numeric" });

  root.innerHTML = `
    <div class="calendar-nav">
      <button id="cal-prev" aria-label="Previous month">&#8249;</button>
      <h4>${monthLabel}</h4>
      <button id="cal-next" aria-label="Next month">&#8250;</button>
    </div>
    <div class="calendar-grid"></div>
  `;

  root.querySelector("#cal-prev").addEventListener("click", () => onOffsetChange?.(-1));
  root.querySelector("#cal-next").addEventListener("click", () => onOffsetChange?.(1));

  const grid = root.querySelector(".calendar-grid");

  for (let i = 1; i <= total; i++) {
    const box = document.createElement("div");
    box.className = "day";
    const dayNum = i - first;
    box.innerHTML = `<div class="day-number">${dayNum > 0 && dayNum <= days ? dayNum : ""}</div>`;

    if (dayNum > 0 && dayNum <= days) {
      const date = `${displayYear}-${String(displayMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      for (const post of posts.filter((p) => p.scheduleDate === date)) {
        const chip = document.createElement("div");
        chip.className = "chip";
        const platformAbbr = post.platforms[0]?.slice(0, 2).toUpperCase() || "–";
        chip.innerHTML = `<div>${escapeHtml(post.title.slice(0, 20) || "Untitled")}</div><div class="chip-meta">${platformAbbr} · ${STATUS_LABELS[post.status] || post.status}</div>`;
        chip.addEventListener("click", () => onOpen(post.id));
        box.append(chip);
      }
    }
    grid.append(box);
  }
}

// ── Inspector ────────────────────────────────────────────────────────────────

export function renderInspector(root, post, handlers) {
  if (!post) {
    root.innerHTML = `<div class="empty">Select a post to edit</div>`;
    return;
  }

  const commentHtml = post.comments
    .map((c) => `<div class="comment-item"><strong>${escapeHtml(c.author)}</strong>: ${escapeHtml(c.text)}</div>`)
    .join("");

  // Per-platform variant fields
  const variantFieldsHtml = post.platforms.map((p) => `
    <div class="mb-8">
      <div class="variant-field-label">${escapeHtml(p)}</div>
      <textarea id="variant-${p.toLowerCase()}" class="variant-textarea">${escapeHtml(post.platformVariants?.[p] || "")}</textarea>
    </div>
  `).join("");

  const clients = handlers?.clients || [];
  const allMedia = handlers?.media || [];
  const postMedia = allMedia.filter((item) => (post.mediaIds || []).includes(item.id));
  const primaryMedia = postMedia[0] || null;
  const mediaPreviewHtml = renderPrimaryMediaPreview(primaryMedia);
  const checklistDone = checklistKeys.filter((key) => post.checklist?.[key]).length;
  const readinessPercent = Math.round((checklistDone / checklistKeys.length) * 100);
  const hashSuggestionPool = Array.isArray(handlers?.hashtagSuggestions) ? handlers.hashtagSuggestions : [];
  const existingTags = new Set((post.tags || []).map((tag) => String(tag || "").trim().toLowerCase()).filter(Boolean));
  const suggestionHtml = hashSuggestionPool
    .filter((entry) => entry.tag && !existingTags.has(entry.tag))
    .slice(0, 6)
    .map((entry) => `<button type="button" class="hashtag-chip" data-hashtag="${escapeHtml(entry.tag)}">#${escapeHtml(entry.tag)} · ${entry.count}</button>`)
    .join("");
  const mediaListHtml = postMedia.length
    ? `<ul class="media-list">${postMedia.map((item) => {
      const url = escapeHtml(item.urlPath || "");
      const downloadUrl = escapeHtml(withDownloadParam(item.urlPath || ""));
      const fileName = escapeHtml(item.fileName || "media");
      return `<li><a href="${url}" target="_blank" rel="noreferrer">${fileName}</a> · <a href="${downloadUrl}" target="_blank" rel="noreferrer" download>Download original</a></li>`;
    }).join("")}</ul>`
    : `<div class="subtle" class="fs-xs-fixed">No media uploaded yet.</div>`;

  root.innerHTML = `
    <div id="form-errors" class="form-errors hidden" role="alert"></div>

    <div class="inspector-tabs" role="tablist" aria-label="Inspector sections">
      <button type="button" class="inspector-tab active" data-inspector-tab="content">Content</button>
      <button type="button" class="inspector-tab" data-inspector-tab="settings">Settings</button>
      <button type="button" class="inspector-tab" data-inspector-tab="collaboration">Collaboration</button>
    </div>

    <section class="inspector-pane" data-inspector-pane="content">
      <div class="readiness-wrap">
        <strong>Post readiness: ${readinessPercent}%</strong>
        <div class="readiness-meter"><div class="readiness-meter-fill" style="width:${readinessPercent}%"></div></div>
      </div>

      <p class="section-title">Post Preview</p>
      <section class="post-preview-card">
        <div class="post-preview-media">
          ${mediaPreviewHtml}
        </div>
        <div class="post-preview-meta">
          <strong>${escapeHtml(post.title || "Untitled Post")}</strong>
          <span class="subtle">${escapeHtml(post.postType || "post")} • ${escapeHtml(post.publishState || "draft")}</span>
          <div class="post-preview-overlay">
            ${iconWithLabel("heart", "2.4k")}
            ${iconWithLabel("message-circle", "184")}
            ${iconWithLabel("send", "Share")}
          </div>
        </div>
      </section>

      <p class="section-title">Caption &amp; Content</p>
      <div class="field"><label for="f-title">Title</label><input id="f-title" value="${escapeHtml(post.title)}" /></div>
      <div class="field">
        <label for="f-media-file">Media Upload</label>
        <div class="media-dropzone" id="f-media-dropzone" tabindex="0" role="button" aria-label="Upload media">
          <div>
            <strong>Drop media here</strong>
            <div class="subtle">or click to browse image/video/PDF</div>
          </div>
        </div>
        <input id="f-media-file" type="file" hidden accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm,application/pdf,.jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.webm,.pdf" />
        <div id="f-media-status" class="subtle" class="fs-xs-fixed"></div>
        ${mediaListHtml}
      </div>
      <div class="field"><label for="f-caption">Caption</label><textarea id="f-caption" class="auto-grow">${escapeHtml(post.caption)}</textarea></div>
      ${suggestionHtml ? `<div class="hashtag-suggestions">${suggestionHtml}</div>` : ""}
      <div class="field">
        <span class="variant-field-label">Platform Captions</span>
        <div class="variant-fields">${variantFieldsHtml || '<div class="subtle" class="fs-xs-fixed">Select platforms above to add per-platform captions.</div>'}</div>
      </div>
    </section>

    <section class="inspector-pane hidden" data-inspector-pane="settings">
      <p class="section-title">Settings &amp; Specifics</p>
      <div class="field"><span class="variant-field-label">Platforms</span>
        <div class="platform-toggles">
          ${PLATFORM_OPTIONS.map((p) => `<button type="button" class="platform-toggle${post.platforms.includes(p) ? " active" : ""}" data-platform="${escapeHtml(p)}">${escapeHtml(p)}</button>`).join("")}
        </div>
      </div>
      <div class="field">
        <label for="f-tags">Tags</label>
        <input id="f-tags" value="${escapeHtml(post.tags.join(", "))}" placeholder="e.g. branding, portfolio" />
        <span class="field-hint">Separate tags with commas</span>
      </div>
      <div class="row">
        <div class="field"><label for="f-status">Status</label>
          <select id="f-status">${STATUSES.map((s) => `<option value="${s}" ${post.status === s ? "selected" : ""}>${STATUS_LABELS[s]}</option>`).join("")}</select>
        </div>
        <div class="field"><label for="f-date">Schedule Date</label><input id="f-date" type="date" value="${post.scheduleDate || ""}" /></div>
      </div>
      <div class="row">
        <div class="field"><label for="f-client-id">Client</label>
          <select id="f-client-id">
            <option value="">Unassigned</option>
            ${clients.map((client) => `<option value="${client.id}" ${post.clientId === client.id ? "selected" : ""}>${escapeHtml(client.name)}</option>`).join("")}
          </select>
        </div>
        <div class="field"><label for="f-visibility">Visibility</label>
          <select id="f-visibility">
            <option value="client-shareable" ${post.visibility === "client-shareable" ? "selected" : ""}>Client Shareable</option>
            <option value="internal" ${post.visibility === "internal" ? "selected" : ""}>Internal Only</option>
          </select>
        </div>
      </div>
      <div class="row">
        <div class="field"><label for="f-publish-state">Publish State</label>
          <select id="f-publish-state">
            <option value="draft" ${post.publishState === "draft" ? "selected" : ""}>Draft</option>
            <option value="scheduled" ${post.publishState === "scheduled" ? "selected" : ""}>Scheduled</option>
            <option value="published" ${post.publishState === "published" ? "selected" : ""}>Published</option>
          </select>
        </div>
        <div class="field"><label for="f-published-at">Published At</label><input id="f-published-at" type="datetime-local" value="${post.publishedAt ? post.publishedAt.slice(0, 16) : ""}" /></div>
      </div>
      <div class="row">
        <div class="field"><label for="f-scheduled-at">Scheduled At</label><input id="f-scheduled-at" type="datetime-local" value="${post.scheduledAt ? post.scheduledAt.slice(0, 16) : ""}" /></div>
        <div class="field"><label for="f-post-type">Post Type</label>
          <select id="f-post-type">
            <option value="static" ${post.postType === "static" ? "selected" : ""}>Static</option>
            <option value="reel" ${post.postType === "reel" ? "selected" : ""}>Reel</option>
            <option value="video" ${post.postType === "video" ? "selected" : ""}>Video</option>
            <option value="carousel" ${post.postType === "carousel" ? "selected" : ""}>Carousel</option>
          </select>
        </div>
      </div>
    </section>

    <section class="inspector-pane hidden" data-inspector-pane="collaboration">
      <p class="section-title">Collaboration</p>
      <div class="row">
        <div class="field"><label for="f-assignee">Assignee</label><input id="f-assignee" value="${escapeHtml(post.assignee || "")}" /></div>
        <div class="field"><label for="f-reviewer">Reviewer</label><input id="f-reviewer" value="${escapeHtml(post.reviewer || "")}" /></div>
      </div>

      <hr>
      <p class="section-title">Publish Readiness</p>
      <div class="checklist">
        ${checklistKeys.map((key) => `<label><input type="checkbox" id="c-${key}" ${post.checklist[key] ? "checked" : ""}/> ${CHECKLIST_LABELS[key]}</label>`).join("")}
      </div>

      <hr>
      <p class="section-title">Comments</p>
      ${commentHtml || `<div class="subtle">No comments yet.</div>`}
      <div id="comment-error" class="comment-error hidden"></div>
      <div class="row" class="mt-8">
        <div class="field"><label for="c-author">Author</label><input id="c-author" placeholder="Name" /></div>
        <div class="field"><label for="c-text">Comment</label><input id="c-text" placeholder="Write a comment" /></div>
      </div>
      <button class="add-btn" id="add-comment">Add Comment</button>
    </section>

    <hr>
    <div class="inspector-actions">
      <button class="save" id="save-post">Save Changes</button>
      <button class="btn-secondary" id="duplicate-post" title="Duplicate post">Duplicate</button>
      <button class="btn-danger" id="delete-post" title="Delete post">Delete</button>
    </div>
  `;

  // Platform toggle logic — updates variant fields live
  const toggles = [...root.querySelectorAll(".platform-toggle")];
  function getSelectedPlatforms() {
    return toggles.filter((b) => b.classList.contains("active")).map((b) => b.dataset.platform);
  }
  function refreshVariantFields() {
    const selected = getSelectedPlatforms();
    const variantRoot = root.querySelector(".variant-fields");
    variantRoot.innerHTML = selected.length ? selected.map((p) => {
      const existing = root.querySelector(`#variant-${p.toLowerCase()}`)?.value || post.platformVariants?.[p] || "";
      return `<div class="mb-8"><div class="variant-field-label">${escapeHtml(p)}</div><textarea id="variant-${p.toLowerCase()}" class="variant-textarea">${escapeHtml(existing)}</textarea></div>`;
    }).join("") : `<div class="subtle" class="fs-xs-fixed">Select platforms above to add per-platform captions.</div>`;
  }
  for (const btn of toggles) {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      refreshVariantFields();
    });
  }

  // Inspector tab logic
  const tabButtons = [...root.querySelectorAll("[data-inspector-tab]")];
  const panes = [...root.querySelectorAll("[data-inspector-pane]")];
  function activateInspectorTab(tab) {
    for (const button of tabButtons) button.classList.toggle("active", button.dataset.inspectorTab === tab);
    for (const pane of panes) pane.classList.toggle("hidden", pane.dataset.inspectorPane !== tab);
  }
  for (const button of tabButtons) {
    button.addEventListener("click", () => activateInspectorTab(button.dataset.inspectorTab));
  }

  // Auto grow caption
  const captionInput = root.querySelector("#f-caption");
  const autoGrow = (field) => {
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.max(field.scrollHeight, 110)}px`;
  };
  autoGrow(captionInput);
  captionInput?.addEventListener("input", () => autoGrow(captionInput));

  // Hashtag suggestions insert
  root.querySelectorAll("[data-hashtag]").forEach((button) => {
    button.addEventListener("click", () => {
      const tag = button.dataset.hashtag;
      if (!tag) return;
      const tagsInput = root.querySelector("#f-tags");
      const current = tagsInput.value
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      if (!current.some((value) => value.toLowerCase() === tag.toLowerCase())) {
        current.push(tag);
      }
      tagsInput.value = current.join(", ");
      const prefix = captionInput?.value?.trim().endsWith("#") ? "" : " ";
      if (captionInput && !extractHashtags(captionInput.value).includes(tag.toLowerCase())) {
        captionInput.value = `${captionInput.value.trim()}${prefix}#${tag}`.trim();
        autoGrow(captionInput);
      }
    });
  });

  // Save
  root.querySelector("#save-post").addEventListener("click", () => {
    const formErrors = [];
    const selectedPlatforms = getSelectedPlatforms();
    if (!selectedPlatforms.length) selectedPlatforms.push("Instagram");

    const variants = {};
    for (const p of selectedPlatforms) {
      variants[p] = root.querySelector(`#variant-${p.toLowerCase()}`)?.value || "";
    }

    const status = root.querySelector("#f-status").value;
    const scheduleDate = root.querySelector("#f-date").value;
    const clientId = root.querySelector("#f-client-id").value;
    const visibility = root.querySelector("#f-visibility").value;
    const publishState = root.querySelector("#f-publish-state").value;
    const publishedAtRaw = root.querySelector("#f-published-at").value;
    const scheduledAtRaw = root.querySelector("#f-scheduled-at").value;
    const publishedAt = publishedAtRaw ? new Date(publishedAtRaw).toISOString() : "";
    const scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw).toISOString() : "";

    const checklist = Object.fromEntries(checklistKeys.map((k) => [k, root.querySelector(`#c-${k}`).checked]));

    if ((status === "in-review" || status === "ready") && !scheduleDate) {
      formErrors.push("Schedule date is required for In Review / Ready.");
    }
    if (!clientId) {
      formErrors.push("Assign a client before saving.");
    }
    if (status === "ready" && !checklist.approval) {
      formErrors.push("Approval must be checked before moving to Ready.");
    }
    if (publishState === "published" && !publishedAt) {
      formErrors.push("Published posts require a Published At timestamp.");
    }
    if (publishState === "scheduled" && !(scheduledAt || scheduleDate)) {
      formErrors.push("Scheduled posts require Scheduled At or Schedule Date.");
    }
    if (publishState === "published" && !["in-review", "ready"].includes(status)) {
      formErrors.push("Published posts must have status In Review or Ready.");
    }

    const errorRoot = root.querySelector("#form-errors");
    if (formErrors.length) {
      errorRoot.classList.remove("hidden");
      errorRoot.innerHTML = `<ul>${formErrors.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}</ul>`;
      return;
    }
    errorRoot.classList.add("hidden");
    errorRoot.innerHTML = "";

    handlers.onSave({
      title: root.querySelector("#f-title").value.trim() || "Untitled Post",
      status,
      scheduleDate,
      clientId,
      visibility,
      publishState,
      publishedAt,
      scheduledAt,
      postType: root.querySelector("#f-post-type").value,
      assignee: root.querySelector("#f-assignee").value.trim(),
      reviewer: root.querySelector("#f-reviewer").value.trim(),
      platforms: selectedPlatforms,
      platformVariants: variants,
      tags: root.querySelector("#f-tags").value.split(",").map((x) => x.trim()).filter(Boolean),
      caption: root.querySelector("#f-caption").value,
      checklist
    });
  });

  // Add comment with validation
  root.querySelector("#add-comment").addEventListener("click", () => {
    const author = root.querySelector("#c-author").value.trim();
    const text = root.querySelector("#c-text").value.trim();
    const commentError = root.querySelector("#comment-error");
    if (!author || !text) {
      commentError.textContent = !author ? "Author name is required." : "Comment text is required.";
      commentError.classList.remove("hidden");
      return;
    }
    commentError.classList.add("hidden");
    handlers.onComment(author, text);
  });

  // Duplicate
  root.querySelector("#duplicate-post").addEventListener("click", () => {
    handlers.onDuplicate?.(post.id);
  });

  // Delete with confirmation
  root.querySelector("#delete-post").addEventListener("click", () => {
    if (confirm(`Delete "${post.title}"? This cannot be undone.`)) {
      handlers.onDelete?.(post.id);
    }
  });

  const mediaInput = root.querySelector("#f-media-file");
  const mediaDropzone = root.querySelector("#f-media-dropzone");
  const mediaStatus = root.querySelector("#f-media-status");
  async function processMediaFile(file) {
    if (!file) return;
    if (!handlers.onUploadMedia) return;
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.type)) {
      mediaStatus.textContent = `Unsupported file type (${file.type || "unknown"}). Allowed: JPG, PNG, GIF, WEBP, MP4, MOV, WEBM, PDF.`;
      return;
    }
    if (file.size > SAFE_MAX_BINARY_UPLOAD_BYTES) {
      mediaStatus.textContent = `File too large (${formatBytes(file.size)}). Max supported size is about ${formatBytes(SAFE_MAX_BINARY_UPLOAD_BYTES)}.`;
      return;
    }
    mediaStatus.textContent = "Uploading...";
    try {
      await handlers.onUploadMedia(file);
      mediaStatus.textContent = "Uploaded.";
    } catch (error) {
      mediaStatus.textContent = `Upload failed: ${error.message || "Unknown error"}`;
    }
  }

  mediaDropzone?.addEventListener("click", () => mediaInput?.click());
  mediaDropzone?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      mediaInput?.click();
    }
  });
  mediaDropzone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    mediaDropzone.classList.add("drag-over");
  });
  mediaDropzone?.addEventListener("dragleave", () => mediaDropzone.classList.remove("drag-over"));
  mediaDropzone?.addEventListener("drop", async (event) => {
    event.preventDefault();
    mediaDropzone.classList.remove("drag-over");
    const file = event.dataTransfer?.files?.[0];
    await processMediaFile(file);
  });

  mediaInput?.addEventListener("change", async () => {
    const file = mediaInput.files?.[0];
    await processMediaFile(file);
    mediaInput.value = "";
  });

  window.lucide?.createIcons();
}

export function renderShareCalendar(root, client, posts, offset = 0, onOffsetChange) {
  root.innerHTML = `
    <div class="share-view-head">
      <h3>${escapeHtml(client.name)} — Shared Calendar</h3>
      <p class="subtle">Client-safe calendar view (internal posts hidden)</p>
    </div>
    <div id="share-calendar-grid"></div>
  `;
  const calendarRoot = root.querySelector("#share-calendar-grid");
  renderCalendar(calendarRoot, posts, () => {}, offset, onOffsetChange);
}

// ── Profile Simulator ────────────────────────────────────────────────────────

function buildMediaMap(media = []) {
  const map = new Map();
  for (const item of media) map.set(item.id, item);
  return map;
}

function getPrimaryMedia(post, mediaMap) {
  const ids = Array.isArray(post.mediaIds) ? post.mediaIds : [];
  for (const id of ids) {
    const media = mediaMap.get(id);
    if (media?.urlPath) return media;
  }
  return null;
}

function renderPreviewMedia(post, mediaMap, className = "") {
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

function instagramTile(post, mediaMap) {
  const type = String(post.postType || "static").toLowerCase();
  const stateBadge = post.publishState === "published" ? "" : `<span class="mock-badge">${escapeHtml(post.publishState)}</span>`;
  const typeIcon = type === "carousel"
    ? `<i data-lucide="copy" class="mock-top-icon" aria-hidden="true"></i>`
    : type === "reel" || type === "video"
    ? `<i data-lucide="play-square" class="mock-top-icon" aria-hidden="true"></i>`
    : "";
  return `
    <article class="mock-ig-tile" title="${escapeHtml(post.title || "Post")}">
      ${renderPreviewMedia(post, mediaMap, "mock-media")}
      <div class="mock-ig-overlay">
        <div class="mock-ig-icons">${typeIcon}</div>
        ${stateBadge}
      </div>
    </article>
  `;
}

function formatViews(index) {
  const presets = ["2.4M", "890K", "1.1M", "776K", "403K", "92K"];
  return presets[index % presets.length];
}

function tiktokTile(post, mediaMap, index) {
  const pinned = index < 3 ? `<span class="mock-pin">Pinned</span>` : "";
  return `
    <article class="mock-tt-tile" title="${escapeHtml(post.title || "Video")}">
      ${renderPreviewMedia(post, mediaMap, "mock-media")}
      <div class="mock-tt-gradient"></div>
      ${pinned}
      <div class="mock-tt-views"><i data-lucide="play" aria-hidden="true"></i><span>${formatViews(index)}</span></div>
    </article>
  `;
}

function getPlatformPosts(posts, mode) {
  const platform = mode === "tiktok" ? "TikTok" : "Instagram";
  return posts.filter((p) => (p.platforms || []).includes(platform));
}

function toInstagramCard(posts, mediaMap, profile) {
  return `
    <section class="inspo-card instagram-card">
      <header class="inspo-profile-head">
        <img src="${escapeHtml(profile.avatarUrl)}" alt="${escapeHtml(profile.displayName)}" class="inspo-avatar" />
        <div class="inspo-profile-meta">
          <h4>${escapeHtml(profile.handle)}</h4>
          <div class="inspo-stats">
            <span><strong>${escapeHtml(String(posts.length))}</strong> posts</span>
            <span><strong>${escapeHtml(profile.followers)}</strong> followers</span>
            <span><strong>${escapeHtml(profile.following)}</strong> following</span>
          </div>
          <p class="inspo-name">${escapeHtml(profile.displayName)}</p>
          <p class="inspo-bio">${escapeHtml(profile.bio).replaceAll("\n", "<br/>")}</p>
          <a href="${escapeHtml(profile.linkUrl)}" target="_blank" rel="noreferrer" class="inspo-link">${escapeHtml(profile.linkText)}</a>
        </div>
      </header>
      <div class="inspo-tabs"><span class="active">Posts</span><span>Reels</span><span>Tagged</span></div>
      <div class="mock-grid instagram">
        ${posts.length ? posts.map((post) => instagramTile(post, mediaMap)).join("") : `<div class="grid-empty">No Instagram posts yet.</div>`}
      </div>
    </section>
  `;
}

function toTiktokCard(posts, mediaMap, profile) {
  return `
    <section class="inspo-card tiktok-card">
      <header class="inspo-profile-head tiktok">
        <img src="${escapeHtml(profile.avatarUrl)}" alt="${escapeHtml(profile.displayName)}" class="inspo-avatar" />
        <div class="inspo-profile-meta">
          <h4>${escapeHtml(profile.handle)}</h4>
          <p class="inspo-name">${escapeHtml(profile.displayName)}</p>
          <div class="inspo-stats">
            <span><strong>${escapeHtml(profile.following)}</strong> Following</span>
            <span><strong>${escapeHtml(profile.followers)}</strong> Followers</span>
            <span><strong>${escapeHtml(profile.likes)}</strong> Likes</span>
          </div>
          <p class="inspo-bio">${escapeHtml(profile.bio).replaceAll("\n", "<br/>")}</p>
          <a href="${escapeHtml(profile.linkUrl)}" target="_blank" rel="noreferrer" class="inspo-link">${escapeHtml(profile.linkText)}</a>
        </div>
      </header>
      <div class="inspo-tabs"><span class="active">Videos</span><span>Favorites</span><span>Liked</span></div>
      <div class="mock-grid tiktok">
        ${posts.length ? posts.map((post, index) => tiktokTile(post, mediaMap, index)).join("") : `<div class="grid-empty">No TikTok posts yet.</div>`}
      </div>
    </section>
  `;
}

function renderSettingsPanel(profile) {
  return `
    <details class="simulator-settings">
      <summary>Profile Simulator Settings</summary>
      <div class="simulator-settings-grid">
        <label>Handle<input data-profile-setting="handle" value="${escapeHtml(profile.handle)}" /></label>
        <label>Display Name<input data-profile-setting="displayName" value="${escapeHtml(profile.displayName)}" /></label>
        <label>Avatar URL<input data-profile-setting="avatarUrl" value="${escapeHtml(profile.avatarUrl)}" /></label>
        <label>Followers<input data-profile-setting="followers" value="${escapeHtml(profile.followers)}" /></label>
        <label>Following<input data-profile-setting="following" value="${escapeHtml(profile.following)}" /></label>
        <label>Likes<input data-profile-setting="likes" value="${escapeHtml(profile.likes)}" /></label>
        <label>Link Text<input data-profile-setting="linkText" value="${escapeHtml(profile.linkText)}" /></label>
        <label>Link URL<input data-profile-setting="linkUrl" value="${escapeHtml(profile.linkUrl)}" /></label>
        <label class="full">Bio<textarea data-profile-setting="bio">${escapeHtml(profile.bio)}</textarea></label>
      </div>
    </details>
  `;
}

export function renderProfileSimulator(root, posts, options) {
  const mode = options?.mode || "instagram";
  const onModeChange = options?.onModeChange;
  const onProfileSettingsChange = options?.onProfileSettingsChange;
  const mediaMap = buildMediaMap(options?.media || []);
  const profile = {
    handle: "zacdeck",
    displayName: "Zac Deck",
    avatarUrl: "https://picsum.photos/seed/profile/300/300",
    followers: "1,523",
    following: "414",
    likes: "24.2M",
    bio: "any pronouns or whatevs man 🤙\n@somewhere ✨\nsay that shit !",
    linkText: "direct.me/zaccy",
    linkUrl: "#",
    ...(options?.profileSettings || {})
  };

  const eligiblePosts = getPlatformPosts(posts, mode);

  root.innerHTML = `
    <div class="profile-toolbar">
      <div class="mode-switch">
        <button class="small ${mode === "instagram" ? "active" : ""}" data-mode="instagram">Instagram</button>
        <button class="small ${mode === "tiktok" ? "active" : ""}" data-mode="tiktok">TikTok</button>
      </div>
      <span class="subtle">${eligiblePosts.length} mapped thumbnails</span>
    </div>
    ${renderSettingsPanel(profile)}
    ${mode === "instagram" ? toInstagramCard(eligiblePosts, mediaMap, profile) : toTiktokCard(eligiblePosts, mediaMap, profile)}
  `;

  root.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => onModeChange?.(button.dataset.mode));
  });
  root.querySelectorAll("[data-profile-setting]").forEach((field) => {
    field.addEventListener("input", () => {
      onProfileSettingsChange?.({ [field.dataset.profileSetting]: field.value });
    });
  });

  window.lucide?.createIcons();
}
