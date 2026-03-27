import { CHECKLIST_LABELS, PLATFORM_OPTIONS, POST_TYPE_OPTIONS, STATUSES, STATUS_LABELS } from "./data.js";

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

function normalizePostType(value = "") {
  const type = String(value || "").toLowerCase();
  if (type === "static") return "photo";
  if (type === "reel") return "shorts";
  if (type === "blog") return "text";
  return type || "photo";
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

function renderCarouselMediaNode(media, className = "") {
  if (!media?.urlPath) return `<div class="carousel-fallback">No media</div>`;
  const url = escapeHtml(media.urlPath);
  const mime = String(media.mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) {
    return `<img src="${url}" alt="${escapeHtml(media.fileName || "carousel image")}" class="${className}" draggable="false" />`;
  }
  if (mime.startsWith("video/")) {
    return `<video class="${className}" muted playsinline preload="metadata"><source src="${url}" type="${escapeHtml(mime)}" /></video>`;
  }
  return `<div class="carousel-fallback">${escapeHtml(media.fileName || "Unsupported")}</div>`;
}

function renderCarouselPreview(postMedia = [], captionPayload = {}) {
  if (!postMedia.length) return `<span class="safe-zone">Upload media to preview carousel</span>`;
  const payload = postMedia.map((media) => ({
    id: media.id,
    urlPath: media.urlPath,
    mimeType: media.mimeType,
    fileName: media.fileName
  }));
  const textPayload = {
    instagram: String(captionPayload.instagram || ""),
    tiktok: String(captionPayload.tiktok || "")
  };
  return `
    <section class="carousel-preview" data-carousel-preview data-carousel-media="${escapeHtml(JSON.stringify(payload))}" data-carousel-captions="${escapeHtml(JSON.stringify(textPayload))}">
      <div class="carousel-phone">
        <div class="carousel-phone-notch"></div>
        <div class="carousel-phone-screen" data-carousel-stage></div>
      </div>
      <div class="carousel-platform-toggle">
        <button type="button" class="carousel-toggle-btn active" data-carousel-platform="instagram">Instagram</button>
        <button type="button" class="carousel-toggle-btn" data-carousel-platform="tiktok">TikTok</button>
      </div>
      <div class="carousel-logic" data-carousel-logic><strong>IG Rule:</strong> The aspect ratio of the 1st slide is locked. Following slides center-crop to match it.</div>
      <div class="carousel-slide-list" data-carousel-slide-list></div>
    </section>
  `;
}

function setupDragToScroll(slider) {
  let isDown = false;
  let startX = 0;
  let scrollLeft = 0;

  slider.classList.add("carousel-grab");
  slider.addEventListener("mousedown", (event) => {
    isDown = true;
    slider.classList.add("carousel-grabbing");
    slider.classList.remove("carousel-grab");
    slider.classList.remove("carousel-snap");
    startX = event.pageX - slider.offsetLeft;
    scrollLeft = slider.scrollLeft;
  });
  slider.addEventListener("mouseleave", () => {
    isDown = false;
    slider.classList.remove("carousel-grabbing");
    slider.classList.add("carousel-grab", "carousel-snap");
  });
  slider.addEventListener("mouseup", () => {
    isDown = false;
    slider.classList.remove("carousel-grabbing");
    slider.classList.add("carousel-grab", "carousel-snap");
  });
  slider.addEventListener("mousemove", (event) => {
    if (!isDown) return;
    event.preventDefault();
    const x = event.pageX - slider.offsetLeft;
    const walk = (x - startX) * 1.5;
    slider.scrollLeft = scrollLeft - walk;
  });
}

function initInspectorCarouselPreview(root, options = {}) {
  const preview = root.querySelector("[data-carousel-preview]");
  if (!preview) return;

  let platform = "instagram";
  let currentSlideIndex = 0;
  const stage = preview.querySelector("[data-carousel-stage]");
  const logic = preview.querySelector("[data-carousel-logic]");
  const slideList = preview.querySelector("[data-carousel-slide-list]");
  let media = [];
  let captionPayload = { instagram: "", tiktok: "" };
  const profileSettings = {
    handle: "zacdeck",
    displayName: "Zac Deck",
    likes: "24.2M",
    ...(options?.profileSettings || {})
  };
  const postDetails = options?.postDetails || {};
  const onReorderSlides = typeof options?.onReorderSlides === "function" ? options.onReorderSlides : null;
  const mediaRatios = new Map();

  try {
    media = JSON.parse(preview.dataset.carouselMedia || "[]");
  } catch {
    media = [];
  }
  try {
    const parsedCaptions = JSON.parse(preview.dataset.carouselCaptions || "{}");
    captionPayload = {
      instagram: String(parsedCaptions?.instagram || ""),
      tiktok: String(parsedCaptions?.tiktok || "")
    };
  } catch {
    captionPayload = { instagram: "", tiktok: "" };
  }
  if (!media.length || !stage) return;

  const compactText = (value = "") => String(value || "").replace(/\s+/g, " ").trim();
  const normalizeHandle = (value = "") => {
    const clean = compactText(value).replace(/^@+/, "");
    return clean || "zacdeck";
  };
  const formatLikes = (value = "") => {
    const raw = compactText(String(value || ""));
    return raw || "1,234";
  };
  const getPostMeta = () => {
    const likes = formatLikes(postDetails.likes || profileSettings.likes || "1,234");
    return { likes };
  };

  const readCaptionForPlatform = (platformKey) => {
    const captionField = root.querySelector("#f-caption");
    const baseCaption = compactText(captionField?.value || "");
    const variantId = platformKey === "instagram" ? "#variant-instagram" : "#variant-tiktok";
    const variantCaption = compactText(root.querySelector(variantId)?.value || "");
    const fallback = compactText(captionPayload[platformKey] || "");
    return variantCaption || baseCaption || fallback || "Add a caption to preview copy here.";
  };

  const syncCarouselCopy = () => {
    const caption = platform === "instagram" ? readCaptionForPlatform("instagram") : readCaptionForPlatform("tiktok");
    const captionNode = stage.querySelector("[data-carousel-caption]");
    if (captionNode) {
      if (platform === "instagram") {
        const displayName = escapeHtml(compactText(profileSettings.displayName || normalizeHandle(profileSettings.handle)));
        captionNode.innerHTML = `<strong>${displayName}</strong> ${escapeHtml(caption)}`;
      } else {
        captionNode.textContent = caption;
      }
    }
    const audioNode = stage.querySelector("[data-carousel-audio]");
    if (audioNode) {
      const audioSeed = compactText(caption).replace(/^#/, "").slice(0, 34) || normalizeHandle(profileSettings.handle);
      audioNode.textContent = `Original sound - ${audioSeed}`;
    }
  };

  const ratioLabel = (ratio) => {
    if (!Number.isFinite(ratio) || ratio <= 0) return "Unknown";
    if (Math.abs(ratio - 1) < 0.05) return "1:1 (Square)";
    if (Math.abs(ratio - 0.8) < 0.05) return "4:5 (Portrait)";
    if (Math.abs(ratio - 0.5625) < 0.05) return "9:16 (Vertical)";
    if (Math.abs(ratio - 1.91) < 0.1) return "1.91:1 (Landscape)";
    return `${ratio.toFixed(2)}:1`;
  };

  const readMediaRatio = (item) => new Promise((resolve) => {
    const mime = String(item?.mimeType || "").toLowerCase();
    if (mime.startsWith("video/")) {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        const ratio = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : null;
        resolve(ratio);
      };
      video.onerror = () => resolve(null);
      video.src = item.urlPath || "";
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : null);
    img.onerror = () => resolve(null);
    img.src = item.urlPath || "";
  });

  let slideOrder = media.map((item) => item.id).filter(Boolean);

  const reorderSlides = async (nextOrder) => {
    if (!Array.isArray(nextOrder) || !nextOrder.length) return;
    slideOrder = nextOrder;
    const rank = new Map(nextOrder.map((id, index) => [id, index]));
    media = [...media].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    paint();
    if (!onReorderSlides) return;
    try {
      await onReorderSlides(nextOrder);
    } catch {
      // keep local optimistic order even if backend sync fails; store layer shows toast
    }
  };

  const setupSlideReorder = () => {
    if (!slideList) return;
    let dragMediaId = "";
    slideList.querySelectorAll("[data-slide-row]").forEach((row) => {
      row.addEventListener("dragover", (event) => {
        event.preventDefault();
      });
      row.addEventListener("drop", (event) => {
        event.preventDefault();
        const targetId = row.getAttribute("data-slide-row") || "";
        if (!dragMediaId || !targetId || dragMediaId === targetId) return;
        const ids = [...slideOrder];
        const from = ids.indexOf(dragMediaId);
        const to = ids.indexOf(targetId);
        if (from < 0 || to < 0) return;
        ids.splice(from, 1);
        ids.splice(to, 0, dragMediaId);
        void reorderSlides(ids);
      });
    });
    slideList.querySelectorAll("[data-slide-handle]").forEach((handle) => {
      handle.addEventListener("dragstart", (event) => {
        dragMediaId = handle.getAttribute("data-slide-handle") || "";
        event.dataTransfer?.setData("text/plain", dragMediaId);
        event.dataTransfer.effectAllowed = "move";
      });
      handle.addEventListener("dragend", () => {
        dragMediaId = "";
      });
    });
  };

  const renderSlideList = () => {
    if (!slideList) return;
    slideList.innerHTML = media.map((item, index) => {
      const ratio = mediaRatios.get(item.id);
      const mime = String(item.mimeType || "").toLowerCase();
      const kind = mime.startsWith("video/") ? "Video" : "Image";
      const badge = index === 0 && platform === "instagram" ? `<span class="carousel-list-badge">Base Ratio</span>` : "";
      const thumb = mime.startsWith("video/")
        ? `<video muted playsinline preload="metadata" src="${escapeHtml(item.urlPath || "")}" class="carousel-list-thumb"></video>`
        : `<img src="${escapeHtml(item.urlPath || "")}" class="carousel-list-thumb" alt="${escapeHtml(item.fileName || "slide")}" />`;
      return `
        <article class="carousel-list-row" data-slide-row="${escapeHtml(item.id || "")}">
          <button type="button" class="carousel-drag-handle" data-slide-handle="${escapeHtml(item.id || "")}" draggable="true" title="Drag to reorder slide" aria-label="Drag to reorder slide ${index + 1}">
            <i data-lucide="grip-vertical" aria-hidden="true"></i>
          </button>
          <div class="carousel-list-thumb-wrap">${thumb}</div>
          <div class="carousel-list-copy">
            <strong>Slide ${index + 1}</strong>
            <span>${kind} • ${ratioLabel(ratio)}</span>
          </div>
          ${badge}
        </article>
      `;
    }).join("");
    setupSlideReorder();
  };

  const computeMediaRatios = async () => {
    await Promise.all(media.map(async (item) => {
      const ratio = await readMediaRatio(item);
      if (Number.isFinite(ratio) && ratio > 0) mediaRatios.set(item.id, ratio);
    }));
    renderSlideList();
  };

  const setActiveDots = () => {
    const dots = stage.querySelectorAll(".carousel-dot");
    dots.forEach((dot, index) => dot.classList.toggle("active", index === currentSlideIndex));
    const fraction = stage.querySelector("[data-carousel-fraction]");
    if (fraction) fraction.textContent = `${currentSlideIndex + 1}/${media.length}`;
  };

  const attachScroller = () => {
    const scroller = stage.querySelector("[data-carousel-scroller]");
    if (!scroller) return;
    let ticking = false;
    scroller.addEventListener("scroll", (event) => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const node = event.target;
        const width = node.offsetWidth || 1;
        const rawIndex = Math.round(node.scrollLeft / width);
        const nextIndex = Math.max(0, Math.min(media.length - 1, rawIndex));
        if (nextIndex !== currentSlideIndex) {
          currentSlideIndex = nextIndex;
          setActiveDots();
        }
        ticking = false;
      });
    });
    setupDragToScroll(scroller);
  };

  const renderInstagram = () => {
    const { likes } = getPostMeta();
    const handle = normalizeHandle(profileSettings.handle);
    const displayName = compactText(profileSettings.displayName || handle);
    const instagramCaption = escapeHtml(readCaptionForPlatform("instagram"));
    const slides = media.map((item) => `
      <div class="carousel-slide carousel-slide-ig">
        ${renderCarouselMediaNode(item, "carousel-media cover")}
      </div>
    `).join("");
    const dots = media.map((_, index) => `<span class="carousel-dot ${index === 0 ? "active" : ""}"></span>`).join("");
    stage.innerHTML = `
      <section class="carousel-ig-shell">
        <div class="carousel-ig-head">
          <span class="carousel-user">${escapeHtml(handle)}</span>
          <i data-lucide="more-horizontal"></i>
        </div>
        <div class="carousel-ig-frame" data-carousel-ig-frame>
          ${media.length > 1 ? `<span class="carousel-fraction" data-carousel-fraction>1/${media.length}</span>` : ""}
          <div class="carousel-scroller carousel-snap" data-carousel-scroller>${slides}</div>
        </div>
        <div class="carousel-ig-footer">
          <div class="carousel-ig-actions">
            <i data-lucide="heart"></i>
            <i data-lucide="message-circle"></i>
            <i data-lucide="send"></i>
          </div>
          <div class="carousel-dots carousel-ig-dots">${dots}</div>
          <span class="carousel-ig-save"><i data-lucide="bookmark"></i></span>
        </div>
        <div class="carousel-ig-meta">
          <p class="carousel-ig-likes">${escapeHtml(likes)} likes</p>
          <p class="carousel-ig-caption" data-carousel-caption><strong>${escapeHtml(displayName)}</strong> ${instagramCaption}</p>
        </div>
      </section>
    `;
    const firstItem = media[0];
    const frame = stage.querySelector("[data-carousel-ig-frame]");
    if (firstItem && frame) {
      const applyRatio = (rawRatio) => {
        let ratio = Number(rawRatio);
        if (!Number.isFinite(ratio) || ratio <= 0) ratio = 4 / 5;
        ratio = Math.max(0.8, Math.min(1.91, ratio));
        frame.style.aspectRatio = String(ratio);
      };
      const cached = mediaRatios.get(firstItem.id);
      if (cached) {
        applyRatio(cached);
      } else {
        readMediaRatio(firstItem).then((ratio) => {
          if (Number.isFinite(ratio) && ratio > 0) mediaRatios.set(firstItem.id, ratio);
          applyRatio(ratio);
          renderSlideList();
        });
      }
    }
  };

  const renderTikTok = () => {
    const handle = normalizeHandle(profileSettings.handle);
    const tiktokCaptionRaw = readCaptionForPlatform("tiktok");
    const tiktokCaption = escapeHtml(tiktokCaptionRaw);
    const tiktokAudio = escapeHtml(`Original sound - ${compactText(tiktokCaptionRaw).replace(/^#/, "").slice(0, 34) || normalizeHandle(profileSettings.handle)}`);
    const slides = media.map((item) => {
      const bgUrl = escapeHtml(item.urlPath || "");
      return `
      <div class="carousel-slide carousel-slide-tt">
        <div class="carousel-tt-blur" style="background-image:url('${bgUrl}')"></div>
        ${renderCarouselMediaNode(item, "carousel-media contain")}
      </div>`;
    }).join("");
    const dots = media.map((_, index) => `<span class="carousel-dot tt ${index === 0 ? "active" : ""}"></span>`).join("");
    stage.innerHTML = `
      <section class="carousel-tt-shell">
        <div class="carousel-tt-top">
          <i data-lucide="search"></i>
          <div class="carousel-tt-mode"><span>Following</span><strong>For You</strong></div>
          <i data-lucide="tv"></i>
        </div>
        <div class="carousel-scroller carousel-snap" data-carousel-scroller>${slides}</div>
        <div class="carousel-tt-actions">
          <span class="carousel-tt-avatar">+</span>
          <span><i data-lucide="heart"></i><em>1.2M</em></span>
          <span><i data-lucide="message-circle-more"></i><em>45K</em></span>
          <span><i data-lucide="bookmark"></i><em>10K</em></span>
          <span><i data-lucide="forward"></i><em>Share</em></span>
        </div>
        <div class="carousel-tt-overlay">
          <div>
            <strong>@${escapeHtml(handle)}</strong>
            <p data-carousel-caption>${tiktokCaption}</p>
            <small data-carousel-audio>${tiktokAudio}</small>
          </div>
          <div class="carousel-dots tt">${dots}</div>
        </div>
      </section>
    `;
  };

  const paint = () => {
    currentSlideIndex = 0;
    if (platform === "instagram") {
      logic.innerHTML = `<strong>IG Rule:</strong> The aspect ratio of the 1st slide is locked. Following slides center-crop to match it.`;
      renderInstagram();
    } else {
      logic.innerHTML = `<strong>TikTok Rule:</strong> Container is fixed to 9:16. Mismatched images are letterboxed with blurred background.`;
      renderTikTok();
    }
    attachScroller();
    setActiveDots();
    renderSlideList();
    syncCarouselCopy();
    window.lucide?.createIcons();
  };

  root.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const id = target.id || "";
    if (id === "f-caption" || id === "variant-instagram" || id === "variant-tiktok") {
      syncCarouselCopy();
    }
  });

  preview.querySelectorAll("[data-carousel-platform]").forEach((button) => {
    button.addEventListener("click", () => {
      platform = button.dataset.carouselPlatform || "instagram";
      preview.querySelectorAll("[data-carousel-platform]").forEach((node) => {
        node.classList.toggle("active", node === button);
      });
      paint();
    });
  });

  computeMediaRatios();
  paint();
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
  const normalizedPostType = normalizePostType(post.postType);
  const allMedia = handlers?.media || [];
  const mediaMapById = new Map(allMedia.map((item) => [item.id, item]));
  const postMedia = (post.mediaIds || []).map((id) => mediaMapById.get(id)).filter(Boolean);
  const primaryMedia = postMedia[0] || null;
  const captionPayload = {
    instagram: post.platformVariants?.Instagram || post.caption || "",
    tiktok: post.platformVariants?.TikTok || post.caption || ""
  };
  const mediaPreviewHtml = normalizedPostType === "carousel"
    ? renderCarouselPreview(postMedia, captionPayload)
    : normalizedPostType === "text"
    ? renderTextPreview(post)
    : renderPrimaryMediaPreview(primaryMedia);
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
      const mimeType = escapeHtml(item.mimeType || "file");
      return `
        <li class="media-item-row" data-media-id="${escapeHtml(item.id || "")}">
          <div class="media-item-main">
            <a href="${url}" target="_blank" rel="noreferrer">${fileName}</a>
            <span class="subtle">${mimeType}</span>
          </div>
          <div class="media-item-actions">
            <a href="${downloadUrl}" target="_blank" rel="noreferrer" download class="btn-media btn-download-original">Download original</a>
            <button type="button" class="btn-media danger icon-only" data-media-delete="${escapeHtml(item.id || "")}" aria-label="Delete media" title="Delete media"><i data-lucide="trash-2" aria-hidden="true"></i></button>
          </div>
        </li>
      `;
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
          <span class="subtle">${escapeHtml(getPostTypeLabel(normalizedPostType))} • ${escapeHtml(post.publishState || "draft")}</span>
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
        <p class="section-title section-title-tight">Platform Captions</p>
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
      <div class="row inspector-single">
        <div class="field"><label for="f-status">Status</label>
          <select id="f-status">${STATUSES.map((s) => `<option value="${s}" ${post.status === s ? "selected" : ""}>${STATUS_LABELS[s]}</option>`).join("")}</select>
        </div>
        <div class="field"><label for="f-date">Schedule Date</label><input id="f-date" type="date" value="${post.scheduleDate || ""}" /></div>
      </div>
      <div class="row inspector-single">
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
      <div class="row inspector-single">
        <div class="field"><label for="f-publish-state">Publish State</label>
          <select id="f-publish-state">
            <option value="draft" ${post.publishState === "draft" ? "selected" : ""}>Draft</option>
            <option value="scheduled" ${post.publishState === "scheduled" ? "selected" : ""}>Scheduled</option>
            <option value="published" ${post.publishState === "published" ? "selected" : ""}>Published</option>
          </select>
        </div>
        <div class="field"><label for="f-published-at">Published At</label><input id="f-published-at" type="datetime-local" value="${post.publishedAt ? post.publishedAt.slice(0, 16) : ""}" /></div>
      </div>
      <div class="row inspector-single">
        <div class="field"><label for="f-scheduled-at">Scheduled At</label><input id="f-scheduled-at" type="datetime-local" value="${post.scheduledAt ? post.scheduledAt.slice(0, 16) : ""}" /></div>
        <div class="field"><label for="f-post-type">Post Type</label>
          <select id="f-post-type">
            ${POST_TYPE_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}" ${normalizedPostType === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
          </select>
        </div>
      </div>
    </section>

    <section class="inspector-pane hidden" data-inspector-pane="collaboration">
      <p class="section-title">Collaboration</p>
      <div class="row inspector-single">
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
      <div class="row inspector-single mt-8">
        <div class="field"><label for="c-author">Author</label><input id="c-author" placeholder="Name" /></div>
        <div class="field"><label for="c-text">Comment</label><textarea id="c-text" placeholder="Write a comment"></textarea></div>
      </div>
      <button class="add-btn" id="add-comment">Add Comment</button>
    </section>

    <hr>
    <div class="inspector-actions">
      <button class="save" id="save-post">Save Changes</button>
      <button class="btn-secondary" id="duplicate-post" title="Duplicate post">Duplicate</button>
      <button class="btn-danger" id="delete-post" title="Delete post">Delete Post</button>
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
      postType: normalizePostType(root.querySelector("#f-post-type").value),
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

  root.querySelectorAll("[data-media-delete]").forEach((button) => {
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

  initInspectorCarouselPreview(root, {
    profileSettings: handlers?.profileSettings || {},
    postDetails: {
      likes: handlers?.profileSettings?.likes || "",
      publishState: post.publishState,
      postType: post.postType
    },
    onReorderSlides: handlers?.onReorderMedia
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
  const type = normalizePostType(post.postType);
  const stateBadge = post.publishState === "published" ? "" : `<span class="mock-badge">${escapeHtml(post.publishState)}</span>`;
  const typeIcon = type === "carousel"
    ? `<i data-lucide="copy" class="mock-top-icon" aria-hidden="true"></i>`
    : type === "shorts" || type === "video"
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
      <span class="subtle">${escapeHtml(options?.clientName || "All Clients")} • ${eligiblePosts.length} mapped thumbnails</span>
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
