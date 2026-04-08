import { CHECKLIST_LABELS, PLATFORM_OPTIONS, POST_TYPE_OPTIONS, STATUSES, STATUS_LABELS } from "../data.js";
import { escapeHtml, normalizePostType, buildMediaMap, checklistKeys } from "./shared.js";
import { renderCarouselPreview, initInspectorCarouselPreview } from "./carousel.js";
import { initSocialMockupPreview, renderSocialMockupPreview } from "./inspector/socialMockups.js";

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
const SAFE_MAX_BINARY_UPLOAD_BYTES = 9 * 1024 * 1024;

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
  if (media?.storageMode === "external") {
    const provider = escapeHtml(String(media.provider || "external").replaceAll("_", " "));
    const label = escapeHtml(media.displayName || media.fileName || "External media");
    return `<div class="external-media-preview"><strong>${label}</strong><span class="subtle">BYOS · ${provider}</span></div>`;
  }
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

function getPostTypeLabel(value = "") {
  const normalized = normalizePostType(value);
  const match = POST_TYPE_OPTIONS.find((option) => option.value === normalized);
  return match?.label || "Photo";
}

function renderTextPreview(post) {
  const headline = escapeHtml(post.title || "Untitled Post");
  const caption = escapeHtml(post.caption || "Start writing your post copy to preview text/blog layout.");
  return `
    <article class="text-preview-card">
      <h4>${headline}</h4>
      <p>${caption.replaceAll("\n", "<br/>")}</p>
    </article>
  `;
}

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
  const normalizedPostType = normalizePostType(post.postType);
  const allMedia = handlers?.media || [];
  const mediaMapById = new Map(allMedia.map((item) => [item.id, item]));
  const postMedia = (post.mediaIds || []).map((id) => mediaMapById.get(id)).filter(Boolean);
  const primaryMedia = postMedia[0] || null;
  const captionPayload = {
    instagram: post.platformVariants?.Instagram || post.caption || "",
    tiktok: post.platformVariants?.TikTok || post.caption || ""
  };
  const mediaMap = buildMediaMap(allMedia);
  const previewPlatform = handlers?.previewPlatform || "instagram";
  const mediaPreviewHtml = normalizedPostType === "carousel"
    ? renderCarouselPreview(postMedia, captionPayload)
    : normalizedPostType === "text"
    ? renderSocialMockupPreview(post, {
        previewPlatform,
        mediaMap,
        profileSettings: handlers?.profileSettings || {}
      })
    : normalizedPostType === "photo" || normalizedPostType === "video" || normalizedPostType === "shorts"
    ? renderSocialMockupPreview(post, {
        previewPlatform,
        mediaMap,
        profileSettings: handlers?.profileSettings || {}
      })
    : renderPrimaryMediaPreview(primaryMedia);
  const checklistDone = checklistKeys.filter((key) => post.checklist?.[key]).length;
  const readinessPercent = Math.round((checklistDone / checklistKeys.length) * 100);
  const readinessVisualPercent = readinessPercent === 0 ? 6 : readinessPercent;
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
      const fileName = escapeHtml(item.displayName || item.fileName || "media");
      const mimeType = escapeHtml(item.mimeType || "file");
      const isExternal = item.storageMode === "external";
      const sourceTag = isExternal
        ? `<span class="subtle media-source-badge">BYOS · ${escapeHtml(String(item.provider || "external").replaceAll("_", " "))}</span>`
        : `<span class="subtle media-source-badge">Uploaded</span>`;
      const primaryAction = isExternal
        ? `<a href="${url}" target="_blank" rel="noopener noreferrer" class="btn-media">Open source</a>
           <button type="button" class="btn-media" data-media-copy-link="${escapeHtml(item.id || "")}">Copy link</button>`
        : `<a href="${downloadUrl}" target="_blank" rel="noreferrer" download class="btn-media btn-download-original">Download original</a>`;
      return `
        <li class="media-item-row" data-media-id="${escapeHtml(item.id || "")}">
          <div class="media-item-main">
            <a href="${url}" target="_blank" rel="noreferrer">${fileName}</a>
            <span class="subtle">${mimeType}</span>
            ${sourceTag}
          </div>
          <div class="media-item-actions">
            ${primaryAction}
            <button type="button" class="btn-media danger icon-only" data-media-delete="${escapeHtml(item.id || "")}" aria-label="Delete media" title="Delete media"><i data-lucide="trash-2" aria-hidden="true"></i></button>
          </div>
        </li>
      `;
    }).join("")}</ul>`
    : `<div class="subtle fs-xs-fixed">No media uploaded yet.</div>`;
  const permissions = {
    canEdit: true,
    canComment: true,
    canDelete: true,
    canDuplicate: true,
    canUploadMedia: true,
    canAttachExternalMedia: true,
    canReorderMedia: true,
    ...(handlers?.permissions || {})
  };
  const handoffButtonsHtml = (Array.isArray(post.platforms) && post.platforms.length ? post.platforms : ["Instagram"])
    .map((platform) => `<button type="button" class="btn-media" data-handoff-platform="${escapeHtml(platform)}">Post to ${escapeHtml(platform)}</button>`)
    .join("");

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
        <div class="readiness-meter"><div class="readiness-meter-fill ${readinessPercent < 10 ? "low" : ""}" style="width:${readinessVisualPercent}%"></div></div>
      </div>

      <div class="content-pane-grid">
        <div class="content-pane-preview">
          <p class="section-title">Post Preview</p>
          <section class="post-preview-card">
            <div class="post-preview-media">
              ${mediaPreviewHtml}
            </div>
            <div class="post-preview-meta">
              <strong>${escapeHtml(post.title || "Untitled Post")}</strong>
              <span class="subtle">${escapeHtml(getPostTypeLabel(normalizedPostType))} • ${escapeHtml(post.publishState || "draft")}</span>
              <span class="preview-pill">Preview only</span>
            </div>
          </section>
        </div>

        <div class="content-pane-fields">
          <p class="section-title">Caption &amp; Content</p>
          <div class="field"><label for="f-title">Title</label><input id="f-title" value="${escapeHtml(post.title)}" ${permissions.canEdit ? "" : "disabled"} /></div>
          <div class="field">
            <label for="f-media-file">Media Upload</label>
            <div class="media-dropzone" id="f-media-dropzone" tabindex="0" role="button" aria-label="Upload media" ${permissions.canUploadMedia ? "" : "aria-disabled=\"true\""}>
              <strong>${permissions.canUploadMedia ? "＋ Add Photo / Video" : "No upload permission"}</strong>
              ${permissions.canUploadMedia ? `<div class="subtle">or drag &amp; drop a file here</div>` : ""}
            </div>
            <input id="f-media-file" type="file" hidden accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm,application/pdf,.jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.webm,.pdf" ${permissions.canUploadMedia ? "" : "disabled"} />
            <div id="f-media-status" class="subtle fs-xs-fixed"></div>
            <div class="external-attach-wrap">
              <label for="f-external-url" class="variant-field-label">Attach by Link (Google Drive / iCloud)</label>
              <input id="f-external-url" type="url" placeholder="https://drive.google.com/... or https://www.icloud.com/..." ${permissions.canAttachExternalMedia ? "" : "disabled"} />
              <div class="subtle fs-xs-fixed">Tip: Drive /view links are auto-normalized for direct fetch when possible.</div>
              <div class="row inspector-single">
                <div class="field">
                  <label for="f-external-provider">Provider</label>
                  <select id="f-external-provider" ${permissions.canAttachExternalMedia ? "" : "disabled"}>
                    <option value="">Auto-detect</option>
                    <option value="google_drive">Google Drive</option>
                    <option value="icloud">iCloud</option>
                    <option value="dropbox">Dropbox</option>
                    <option value="onedrive">OneDrive</option>
                    <option value="direct">Direct Link</option>
                  </select>
                </div>
                <div class="field">
                  <label for="f-external-display-name">Label</label>
                  <input id="f-external-display-name" type="text" placeholder="Optional label" ${permissions.canAttachExternalMedia ? "" : "disabled"} />
                </div>
              </div>
              <button type="button" class="btn-media" id="attach-external-media" ${permissions.canAttachExternalMedia ? "" : "disabled"}>Attach from cloud link</button>
            </div>
            ${mediaListHtml}
          </div>
          <div class="field"><label for="f-caption">Caption</label><textarea id="f-caption" class="auto-grow" ${permissions.canEdit ? "" : "disabled"}>${escapeHtml(post.caption)}</textarea></div>
          ${suggestionHtml ? `<div class="hashtag-suggestions">${suggestionHtml}</div>` : ""}
          <div class="field">
            <p class="section-title section-title-tight">Platform Captions</p>
            <div class="variant-fields">${variantFieldsHtml || '<div class="subtle" class="fs-xs-fixed">Select platforms above to add per-platform captions.</div>'}</div>
          </div>
        </div>
      </div>
    </section>

    <section class="inspector-pane hidden" data-inspector-pane="settings">
      <p class="section-title">Settings &amp; Specifics</p>
      <p class="settings-note">Workspace filters only change what you see. These fields change this post.</p>
      <div class="field"><span class="variant-field-label">Platforms</span>
        <div class="platform-toggles">
          ${PLATFORM_OPTIONS.map((p) => `<button type="button" class="platform-toggle${post.platforms.includes(p) ? " active" : ""}" data-platform="${escapeHtml(p)}" ${permissions.canEdit ? "" : "disabled"}>${escapeHtml(p)}</button>`).join("")}
        </div>
      </div>
      <div class="field">
        <label for="f-tags">Tags</label>
        <input id="f-tags" value="${escapeHtml(post.tags.join(", "))}" placeholder="e.g. branding, portfolio" ${permissions.canEdit ? "" : "disabled"} />
        <span class="field-hint">Separate tags with commas</span>
      </div>
      <div class="row inspector-single">
        <div class="field"><label for="f-status">Status</label>
          <select id="f-status" ${permissions.canEdit ? "" : "disabled"}>${STATUSES.map((s) => `<option value="${s}" ${post.status === s ? "selected" : ""}>${STATUS_LABELS[s]}</option>`).join("")}</select>
        </div>
        <div class="field"><label for="f-date">Schedule Date</label><input id="f-date" type="date" value="${post.scheduleDate || ""}" ${permissions.canEdit ? "" : "disabled"} /></div>
      </div>
      <div class="row inspector-single">
        <div class="field"><label for="f-client-id">Client</label>
          <select id="f-client-id" ${permissions.canEdit ? "" : "disabled"}>
            <option value="">Unassigned</option>
            ${clients.map((client) => `<option value="${client.id}" ${post.clientId === client.id ? "selected" : ""}>${escapeHtml(client.name)}</option>`).join("")}
          </select>
        </div>
        <div class="field"><label for="f-visibility">Visibility</label>
          <select id="f-visibility" ${permissions.canEdit ? "" : "disabled"}>
            <option value="client-shareable" ${post.visibility === "client-shareable" ? "selected" : ""}>Client Shareable</option>
            <option value="internal" ${post.visibility === "internal" ? "selected" : ""}>Internal Only</option>
          </select>
        </div>
      </div>
      <div class="row inspector-single">
        <div class="field"><label for="f-publish-state">Publish State</label>
          <select id="f-publish-state" ${permissions.canEdit ? "" : "disabled"}>
            <option value="draft" ${post.publishState === "draft" ? "selected" : ""}>Draft</option>
            <option value="scheduled" ${post.publishState === "scheduled" ? "selected" : ""}>Scheduled</option>
            <option value="published" ${post.publishState === "published" ? "selected" : ""}>Published</option>
          </select>
        </div>
        <div class="field"><label for="f-published-at">Published At</label><input id="f-published-at" type="datetime-local" value="${post.publishedAt ? post.publishedAt.slice(0, 16) : ""}" ${permissions.canEdit ? "" : "disabled"} /></div>
      </div>
      <div class="row inspector-single">
        <div class="field"><label for="f-scheduled-at">Scheduled At</label><input id="f-scheduled-at" type="datetime-local" value="${post.scheduledAt ? post.scheduledAt.slice(0, 16) : ""}" ${permissions.canEdit ? "" : "disabled"} /></div>
        <div class="field"><label for="f-post-type">Post Type</label>
          <select id="f-post-type" ${permissions.canEdit ? "" : "disabled"}>
            ${POST_TYPE_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}" ${normalizedPostType === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
          </select>
        </div>
      </div>
    </section>

    <section class="inspector-pane hidden" data-inspector-pane="collaboration">
      <p class="section-title">Collaboration</p>
      <div class="row inspector-single">
        <div class="field"><label for="f-assignee">Assignee</label><input id="f-assignee" value="${escapeHtml(post.assignee || "")}" ${permissions.canEdit ? "" : "disabled"} /></div>
        <div class="field"><label for="f-reviewer">Reviewer</label><input id="f-reviewer" value="${escapeHtml(post.reviewer || "")}" ${permissions.canEdit ? "" : "disabled"} /></div>
      </div>

      <hr>
      <p class="section-title">Publish Readiness</p>
      <div class="checklist">
        ${checklistKeys.map((key) => `<label><input type="checkbox" id="c-${key}" ${post.checklist[key] ? "checked" : ""} ${permissions.canEdit ? "" : "disabled"}/> ${CHECKLIST_LABELS[key]}</label>`).join("")}
      </div>

      <hr>
      <p class="section-title">Comments</p>
      ${commentHtml || `<div class="subtle">No comments yet.</div>`}
      <div id="comment-error" class="comment-error hidden"></div>
      <div class="row inspector-single mt-8">
        <div class="field"><label for="c-author">Author</label><input id="c-author" placeholder="Name" ${permissions.canComment ? "" : "disabled"} /></div>
        <div class="field"><label for="c-text">Comment</label><textarea id="c-text" placeholder="Write a comment" ${permissions.canComment ? "" : "disabled"}></textarea></div>
      </div>
      <button class="add-btn" id="add-comment" ${permissions.canComment ? "" : "disabled"}>Add Comment</button>

      <hr>
      <p class="section-title">Publish Handoff</p>
      <p class="subtle fs-xs-fixed">Caption will be copied to your clipboard before opening the platform upload page.</p>
      <div class="media-item-actions">
        ${handoffButtonsHtml}
      </div>
    </section>

    <div class="inspector-actions">
      <button class="save icon-btn" id="save-post" title="Save changes" aria-label="Save changes" ${permissions.canEdit ? "" : "disabled"}><i data-lucide="save" aria-hidden="true"></i></button>
      <button class="btn-secondary icon-btn" id="duplicate-post" title="Duplicate post" aria-label="Duplicate post" ${permissions.canDuplicate ? "" : "disabled"}><i data-lucide="copy" aria-hidden="true"></i></button>
      <button class="btn-danger icon-btn" id="delete-post" title="Delete post" aria-label="Delete post" ${permissions.canDelete ? "" : "disabled"}><i data-lucide="trash-2" aria-hidden="true"></i></button>
    </div>
  `;

  const saveButton = root.querySelector("#save-post");
  let isDirty = false;
  const markDirty = () => {
    if (!permissions.canEdit || isDirty) return;
    isDirty = true;
    saveButton?.classList.add("is-dirty");
  };

  root.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.id === "save-post") return;
    markDirty();
  });
  root.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    markDirty();
  });

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
      if (!permissions.canEdit) return;
      btn.classList.toggle("active");
      refreshVariantFields();
      markDirty();
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
    if (!permissions.canEdit) return;
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

    const checklist = Object.fromEntries(checklistKeys.map((k) => [k, root.querySelector(`#c-${k}`)?.checked ?? false]));

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
      postType: normalizePostType(root.querySelector("#f-post-type").value),
      assignee: root.querySelector("#f-assignee").value.trim(),
      reviewer: root.querySelector("#f-reviewer").value.trim(),
      platforms: selectedPlatforms,
      platformVariants: variants,
      tags: root.querySelector("#f-tags").value.split(",").map((x) => x.trim()).filter(Boolean),
      caption: root.querySelector("#f-caption").value,
      checklist
    });
    isDirty = false;
    if (saveButton) saveButton.textContent = "Save Changes";
  });

  // Add comment with validation
  root.querySelector("#add-comment").addEventListener("click", () => {
    if (!permissions.canComment) return;
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
    if (!permissions.canDuplicate) return;
    handlers.onDuplicate?.(post.id);
  });

  // Delete with confirmation
  root.querySelector("#delete-post").addEventListener("click", async () => {
    if (!permissions.canDelete) return;
    const confirmFn = handlers.confirm ?? ((title, msg) => Promise.resolve(confirm(`${title}\n${msg || ""}`)));
    const ok = await confirmFn(
      `Delete "${post.title}"?`,
      "This cannot be undone.",
      { danger: true, okLabel: "Delete" }
    );
    if (ok) handlers.onDelete?.(post.id);
  });

  const mediaInput = root.querySelector("#f-media-file");
  const mediaDropzone = root.querySelector("#f-media-dropzone");
  const mediaStatus = root.querySelector("#f-media-status");
  async function processMediaFile(file) {
    if (!file) return;
    if (!handlers.onUploadMedia) return;
    if (!permissions.canUploadMedia) {
      mediaStatus.textContent = "You do not have permission to upload media.";
      return;
    }
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

  mediaDropzone?.addEventListener("click", () => {
    if (!permissions.canUploadMedia) return;
    mediaInput?.click();
  });
  mediaDropzone?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      if (!permissions.canUploadMedia) return;
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
    if (!permissions.canUploadMedia) return;
    const file = event.dataTransfer?.files?.[0];
    await processMediaFile(file);
  });

  mediaInput?.addEventListener("change", async () => {
    const file = mediaInput.files?.[0];
    await processMediaFile(file);
    mediaInput.value = "";
  });

  root.querySelectorAll("[data-media-delete]").forEach((button) => {
    if (!permissions.canEdit) {
      button.setAttribute("disabled", "disabled");
      return;
    }
    button.addEventListener("click", async () => {
      const mediaId = button.getAttribute("data-media-delete") || "";
      if (!mediaId || !handlers.onRemoveMedia) return;
      mediaStatus.textContent = "Removing...";
      try {
        await handlers.onRemoveMedia(mediaId);
        mediaStatus.textContent = "Removed.";
      } catch (error) {
        mediaStatus.textContent = `Remove failed: ${error.message || "Unknown error"}`;
      }
    });
  });

  root.querySelectorAll("[data-media-copy-link]").forEach((button) => {
    button.addEventListener("click", async () => {
      const mediaId = button.getAttribute("data-media-copy-link") || "";
      if (!mediaId || !handlers.onCopyMediaLink) return;
      try {
        await handlers.onCopyMediaLink(mediaId);
        mediaStatus.textContent = "Media link copied.";
      } catch (error) {
        mediaStatus.textContent = `Copy link failed: ${error.message || "Unknown error"}`;
      }
    });
  });

  const externalAttachButton = root.querySelector("#attach-external-media");
  externalAttachButton?.addEventListener("click", async () => {
    if (!permissions.canAttachExternalMedia || !handlers.onAttachExternalMedia) return;
    const externalUrl = String(root.querySelector("#f-external-url")?.value || "").trim();
    const provider = String(root.querySelector("#f-external-provider")?.value || "").trim();
    const displayName = String(root.querySelector("#f-external-display-name")?.value || "").trim();
    if (!externalUrl) {
      mediaStatus.textContent = "Please enter a cloud link first.";
      return;
    }
    mediaStatus.textContent = "Attaching cloud link...";
    try {
      await handlers.onAttachExternalMedia({ externalUrl, provider, displayName });
      mediaStatus.textContent = "Cloud link attached.";
      const urlInput = root.querySelector("#f-external-url");
      const nameInput = root.querySelector("#f-external-display-name");
      if (urlInput) urlInput.value = "";
      if (nameInput) nameInput.value = "";
    } catch (error) {
      const status = Number(error?.status || 0);
      const hint = String(error?.hint || "").trim();
      const lowerMessage = String(error?.message || "").toLowerCase();
      const providerValidationError = lowerMessage.includes("provider must be one of");
      const urlValidationError = lowerMessage.includes("valid https link")
        || lowerMessage.includes("https link")
        || lowerMessage.includes("externalurl")
        || lowerMessage.includes("external url");
      if (status === 404) {
        mediaStatus.textContent = "Attach failed: endpoint not found. Check deployed API version for /api/*/media/external.";
      } else if (status === 403) {
        mediaStatus.textContent = "Attach failed: you do not have permission to attach media for this post.";
      } else if (status === 400 && providerValidationError) {
        mediaStatus.textContent = "Attach failed: we couldn’t recognize that provider. Leave provider on Auto-detect (recommended) or paste a direct https share link.";
      } else if (status === 400 && urlValidationError) {
        mediaStatus.textContent = "Attach failed: paste a full https cloud link (example: https://drive.google.com/...).";
      } else if (status === 400 && hint && hint.toLowerCase().includes("public https")) {
        mediaStatus.textContent = "Attach failed: that cloud file link is not publicly accessible. Update sharing to ‘Anyone with the link’ or use a direct public URL.";
      } else if (status === 400 && hint) {
        mediaStatus.textContent = `Attach failed: ${hint}`;
      } else {
        mediaStatus.textContent = `Attach failed: ${error.message || "Unknown error"}`;
      }
    }
  });

  root.querySelectorAll("[data-handoff-platform]").forEach((button) => {
    button.addEventListener("click", async () => {
      const platform = String(button.getAttribute("data-handoff-platform") || "").trim();
      if (!platform || !handlers.onHandoffPublish) return;
      await handlers.onHandoffPublish({
        platform,
        caption: post.platformVariants?.[platform] || post.caption || "",
        media: postMedia,
        postId: post.id
      });
    });
  });

  initInspectorCarouselPreview(root, {
    profileSettings: handlers?.profileSettings || {},
    postDetails: {
      likes: handlers?.profileSettings?.likes || "",
      publishState: post.publishState,
      postType: post.postType
    },
    onReorderSlides: permissions.canReorderMedia ? handlers?.onReorderMedia : null
  });
  if (normalizedPostType !== "carousel") {
    initSocialMockupPreview(root, post, {
      previewPlatform,
      mediaMap,
      profileSettings: handlers?.profileSettings || {},
      onPlatformChange: handlers?.onPreviewPlatformChange
    });
  }
  window.lucide?.createIcons();
}
