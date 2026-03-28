import { escapeHtml } from "./shared.js";

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

export function renderCarouselPreview(postMedia = [], captionPayload = {}) {
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

export function initInspectorCarouselPreview(root, options = {}) {
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
    handle: "brand",
    displayName: "Client",
    likes: "—",
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
    return clean || "brand";
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

  if (root._carouselInputHandler) {
    root.removeEventListener("input", root._carouselInputHandler);
  }
  root._carouselInputHandler = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const id = target.id || "";
    if (id === "f-caption" || id === "variant-instagram" || id === "variant-tiktok") {
      syncCarouselCopy();
    }
  };
  root.addEventListener("input", root._carouselInputHandler);

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
