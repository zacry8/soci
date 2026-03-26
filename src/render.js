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

function renderPrimaryMediaPreview(media) {
  if (!media?.urlPath) return `<span class="safe-zone">Media preview</span>`;
  const url = escapeHtml(media.urlPath);
  const name = escapeHtml(media.fileName || "media");
  const mime = String(media.mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) {
    return `<img src="${url}" alt="${name}" loading="lazy" decoding="async" style="max-width:100%;max-height:220px;object-fit:cover;border-radius:10px;display:block"/>`;
  }
  if (mime.startsWith("video/")) {
    return `<video controls preload="metadata" style="max-width:100%;max-height:220px;border-radius:10px;display:block"><source src="${url}" type="${escapeHtml(mime)}"/>Your browser does not support video preview.</video>`;
  }
  return `<a href="${url}" target="_blank" rel="noreferrer">${name}</a>`;
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
    <div style="margin-bottom:8px">
      <div class="variant-field-label">${escapeHtml(p)}</div>
      <textarea id="variant-${p.toLowerCase()}" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:8px;font:inherit;min-height:60px;resize:vertical">${escapeHtml(post.platformVariants?.[p] || "")}</textarea>
    </div>
  `).join("");

  const clients = handlers?.clients || [];
  const allMedia = handlers?.media || [];
  const postMedia = allMedia.filter((item) => (post.mediaIds || []).includes(item.id));
  const primaryMedia = postMedia[0] || null;
  const mediaPreviewHtml = renderPrimaryMediaPreview(primaryMedia);
  const mediaListHtml = postMedia.length
    ? `<ul>${postMedia.map((item) => {
      const url = escapeHtml(item.urlPath || "");
      const downloadUrl = escapeHtml(withDownloadParam(item.urlPath || ""));
      const fileName = escapeHtml(item.fileName || "media");
      return `<li><a href="${url}" target="_blank" rel="noreferrer">${fileName}</a> · <a href="${downloadUrl}" target="_blank" rel="noreferrer" download>Download original</a></li>`;
    }).join("")}</ul>`
    : `<div class="subtle" style="font-size:12px">No media uploaded yet.</div>`;

  root.innerHTML = `
    <div id="form-errors" class="form-errors hidden" role="alert"></div>

    <p class="section-title">Post Preview</p>
    <section class="post-preview-card">
      <div class="post-preview-media">
        ${mediaPreviewHtml}
      </div>
      <div class="post-preview-meta">
        <strong>${escapeHtml(post.title || "Untitled Post")}</strong>
        <span class="subtle">${escapeHtml(post.postType || "post")} • ${escapeHtml(post.publishState || "draft")}</span>
      </div>
    </section>

    <p class="section-title">Caption &amp; Content</p>
    <div class="field"><label for="f-title">Title</label><input id="f-title" value="${escapeHtml(post.title)}" /></div>
    <div class="field">
      <label for="f-media-file">Media Upload</label>
      <input id="f-media-file" type="file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm,application/pdf,.jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.webm,.pdf" />
      <div id="f-media-status" class="subtle" style="font-size:12px"></div>
      ${mediaListHtml}
    </div>
    <div class="field"><label for="f-caption">Caption</label><textarea id="f-caption">${escapeHtml(post.caption)}</textarea></div>
    <div class="field">
      <span class="variant-field-label">Platform Captions</span>
      <div class="variant-fields">${variantFieldsHtml || '<div class="subtle" style="font-size:12px">Select platforms above to add per-platform captions.</div>'}</div>
    </div>

    <hr>
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

    <hr>
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
    <div class="row" style="margin-top:8px">
      <div class="field"><label for="c-author">Author</label><input id="c-author" placeholder="Name" /></div>
      <div class="field"><label for="c-text">Comment</label><input id="c-text" placeholder="Write a comment" /></div>
    </div>
    <button class="add-btn" id="add-comment">Add Comment</button>

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
      return `<div style="margin-bottom:8px"><div class="variant-field-label">${escapeHtml(p)}</div><textarea id="variant-${p.toLowerCase()}" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:8px;font:inherit;min-height:60px;resize:vertical">${escapeHtml(existing)}</textarea></div>`;
    }).join("") : `<div class="subtle" style="font-size:12px">Select platforms above to add per-platform captions.</div>`;
  }
  for (const btn of toggles) {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      refreshVariantFields();
    });
  }

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
  const mediaStatus = root.querySelector("#f-media-status");
  mediaInput?.addEventListener("change", async () => {
    const file = mediaInput.files?.[0];
    if (!file) return;
    if (!handlers.onUploadMedia) return;
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.type)) {
      mediaStatus.textContent = `Unsupported file type (${file.type || "unknown"}). Allowed: JPG, PNG, GIF, WEBP, MP4, MOV, WEBM, PDF.`;
      mediaInput.value = "";
      return;
    }
    if (file.size > SAFE_MAX_BINARY_UPLOAD_BYTES) {
      mediaStatus.textContent = `File too large (${formatBytes(file.size)}). Max supported size is about ${formatBytes(SAFE_MAX_BINARY_UPLOAD_BYTES)}.`;
      mediaInput.value = "";
      return;
    }
    mediaStatus.textContent = "Uploading...";
    try {
      await handlers.onUploadMedia(file);
      mediaStatus.textContent = "Uploaded.";
      mediaInput.value = "";
    } catch (error) {
      mediaStatus.textContent = `Upload failed: ${error.message || "Unknown error"}`;
    }
  });
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

function tile(post) {
  return `
    <article class="feed-tile ${post.postType || "static"}">
      <div class="tile-thumb">${escapeHtml((post.title || "").slice(0, 22) || "Untitled")}</div>
      <div class="tile-meta">${post.postType || "post"} • ${post.publishState}</div>
    </article>
  `;
}

function makeAudit(posts, mode) {
  const platform = mode === "tiktok" ? "TikTok" : "Instagram";
  const now = Date.now();
  const checks = [];

  const published = posts.filter((p) => p.publishState === "published");
  const scheduled = posts.filter((p) => p.publishState === "scheduled");
  const missingPublishedAt = published.filter((p) => !p.publishedAt);
  const futurePublishedAt = published.filter((p) => p.publishedAt && new Date(p.publishedAt).getTime() > now);
  const missingScheduledAt = scheduled.filter((p) => !(p.scheduledAt || p.scheduleDate));
  const idSet = new Set();
  const duplicateIds = [];
  for (const post of posts) {
    if (idSet.has(post.id)) duplicateIds.push(post.id);
    idSet.add(post.id);
  }

  checks.push({
    level: missingPublishedAt.length ? "error" : "ok",
    label: "Published posts have timestamps",
    detail: missingPublishedAt.length
      ? `${missingPublishedAt.length} published posts missing publishedAt.`
      : "All published posts include publishedAt.",
    targets: missingPublishedAt.map((p) => p.id)
  });
  checks.push({
    level: futurePublishedAt.length ? "warning" : "ok",
    label: "Published timestamps are in the past",
    detail: futurePublishedAt.length
      ? `${futurePublishedAt.length} published posts have future timestamps.`
      : "No future-dated published posts found.",
    targets: futurePublishedAt.map((p) => p.id)
  });
  checks.push({
    level: missingScheduledAt.length ? "warning" : "ok",
    label: "Scheduled posts have schedule metadata",
    detail: missingScheduledAt.length
      ? `${missingScheduledAt.length} scheduled posts missing schedule metadata.`
      : "All scheduled posts include schedule metadata.",
    targets: missingScheduledAt.map((p) => p.id)
  });
  checks.push({
    level: duplicateIds.length ? "error" : "ok",
    label: "Post IDs are unique",
    detail: duplicateIds.length ? `${duplicateIds.length} duplicate post IDs detected.` : "No duplicate IDs detected.",
    targets: duplicateIds
  });

  const modeEligible = posts.filter((p) => (p.platforms || []).includes(platform));
  checks.push({
    level: modeEligible.length ? "ok" : "warning",
    label: `${platform} profile has eligible posts`,
    detail: modeEligible.length
      ? `${modeEligible.length} posts are eligible for ${platform}.`
      : `No ${platform}-eligible posts found.`,
    targets: []
  });

  const hasError = checks.some((c) => c.level === "error");
  const hasWarning = checks.some((c) => c.level === "warning");
  const summary = hasError ? "error" : hasWarning ? "warning" : "ok";

  return { checks, summary, platform, modeEligible };
}

export function renderProfileSimulator(root, posts, options) {
  const mode = options?.mode || "instagram";
  const onModeChange = options?.onModeChange;
  const onFixPost = options?.onFixPost;
  const integrity = options?.integrity || { level: "ok", message: "Profile integrity verified." };

  const audit = makeAudit(posts, mode);
  const eligiblePosts = audit.modeEligible;

  const published = eligiblePosts.filter((p) => p.publishState === "published");
  const futureAsc = eligiblePosts
    .filter((p) => p.publishState !== "published")
    .sort((a, b) => {
      const aDate = new Date(a.scheduledAt || `${a.scheduleDate || "2099-12-31"}T09:00:00`).getTime();
      const bDate = new Date(b.scheduledAt || `${b.scheduleDate || "2099-12-31"}T09:00:00`).getTime();
      return aDate - bDate;
    });

  const projected = [...futureAsc].reverse().concat(published);
  const topNine = projected.slice(0, 9);

  root.innerHTML = `
    <div class="profile-toolbar">
      <div class="mode-switch">
        <button class="small ${mode === "instagram" ? "active" : ""}" data-mode="instagram">Instagram</button>
        <button class="small ${mode === "tiktok" ? "active" : ""}" data-mode="tiktok">TikTok</button>
      </div>
      <span class="integrity ${integrity.level}">${escapeHtml(integrity.message)}</span>
    </div>

    <section class="mock-profile ${mode}">
      <header class="mock-header">
        <div><strong>${mode === "instagram" ? "@yourstudio" : "@yourstudio.tok"}</strong></div>
        <div class="subtle">Current posts: ${published.length} • Planned: ${futureAsc.length}</div>
      </header>

      <section class="audit-panel ${audit.summary}">
        <h4>Accuracy Audit</h4>
        <ul>
          ${audit.checks.map((check) => `
            <li class="${check.level}">
              <div class="audit-line">
                <strong>${escapeHtml(check.label)}</strong>
                ${check.targets?.length ? `<button class="small audit-fix" data-fix="${check.targets[0]}">Fix now</button>` : ""}
              </div>
              <span>${escapeHtml(check.detail)}</span>
            </li>
          `).join("")}
        </ul>
      </section>

      <p class="section-title">Current Profile (published)</p>
      <div class="mock-grid ${mode}">${published.map(tile).join("") || `<div class="grid-empty">No published posts yet.</div>`}</div>

      <p class="section-title">Projected Top 9 (after future posts)</p>
      <div class="mock-grid ${mode}">${topNine.map(tile).join("") || `<div class="grid-empty">No future projection available.</div>`}</div>
    </section>
  `;

  root.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => onModeChange?.(button.dataset.mode));
  });
  root.querySelectorAll("[data-fix]").forEach((button) => {
    button.addEventListener("click", () => onFixPost?.(button.dataset.fix));
  });
}
