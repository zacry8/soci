import { escapeHtml, getPrimaryMedia } from "../shared.js";

const PLATFORM_OPTIONS = ["instagram", "tiktok", "twitter", "facebook", "linkedin", "reddit"];
const PLATFORM_META = {
  instagram: { label: "Instagram", icon: "instagram" },
  tiktok: { label: "TikTok", icon: "music2" },
  twitter: { label: "X / Twitter", icon: "twitter" },
  facebook: { label: "Facebook", icon: "facebook" },
  linkedin: { label: "LinkedIn", icon: "linkedin" },
  reddit: { label: "Reddit", icon: "reddit" }
};

// Source: Simple Icons path data (normalized to viewBox 0 0 24 24 for uniform sizing)
const PLATFORM_SWITCHER_ICON_PATHS = {
  instagram: "M7.754 2C4.679 2 2 4.679 2 7.754v8.492C2 19.321 4.679 22 7.754 22h8.492C19.321 22 22 19.321 22 16.246V7.754C22 4.679 19.321 2 16.246 2H7.754zm0 1.548h8.492c2.241 0 4.206 1.965 4.206 4.206v8.492c0 2.241-1.965 4.206-4.206 4.206H7.754c-2.241 0-4.206-1.965-4.206-4.206V7.754c0-2.241 1.965-4.206 4.206-4.206zm9.218 1.167a1.08 1.08 0 100 2.16 1.08 1.08 0 000-2.16zM12 6.757A5.243 5.243 0 106.757 12 5.249 5.249 0 0012 6.757zm0 1.548A3.695 3.695 0 118.305 12 3.699 3.699 0 0112 8.305z",
  tiktok: "M13.645 2.948c.042.686.268 1.35.657 1.912a3.55 3.55 0 002.976 1.627v2.864a6.32 6.32 0 01-2.2-.392v5.839a5.799 5.799 0 11-5.014-5.748v2.978a2.866 2.866 0 00-.842-.124 2.866 2.866 0 102.909 2.866V2.948h1.514z",
  twitter: "M18.901 1.153h3.68l-8.04 9.19L24 22.847h-7.406l-5.8-7.584-6.64 7.584H.471l8.6-9.83L0 1.154h7.594l5.243 6.932 6.064-6.933zm-1.292 19.492h2.04L6.486 3.24H4.298l13.311 17.405z",
  facebook: "M13.5 22v-8h2.6l.4-3h-3V9.1c0-.87.25-1.46 1.5-1.46h1.6V5a20 20 0 00-2.4-.12c-2.37 0-4 1.45-4 4.1V11H7.9v3h2.3v8h3.3z",
  linkedin: "M20.447 20.452h-3.554v-5.569c0-1.328-.028-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.35V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 11.001-4.124 2.062 2.062 0 01-.001 4.124zM7.119 20.452H3.555V9h3.564v11.452z",
  reddit: "M14.374 12.146c.304 0 .552.247.552.552a.552.552 0 01-.552.552.552.552 0 01-.552-.552c0-.305.247-.552.552-.552zm-4.748 0c.304 0 .551.247.551.552a.551.551 0 11-1.103 0c0-.305.247-.552.552-.552zm2.371 4.794c-1.205 0-2.248-.54-2.248-1.29a.275.275 0 01.551 0c0 .358.694.739 1.697.739 1.003 0 1.697-.381 1.697-.739a.275.275 0 01.551 0c0 .75-1.043 1.29-2.248 1.29zM22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10zm-3.05 0c0-.913-.741-1.654-1.654-1.654-.436 0-.832.17-1.128.446-1.103-.738-2.559-1.22-4.173-1.283l.896-2.817 2.43.573a1.379 1.379 0 102.454-.865 1.378 1.378 0 00-2.75 0c0 .096.01.19.029.281l-2.68-.632a.276.276 0 00-.33.183l-1.006 3.169c-1.664.038-3.169.525-4.307 1.286a1.646 1.646 0 00-2.782 1.159c0 .623.346 1.161.855 1.443a3.16 3.16 0 00-.056.589c0 2.259 2.746 4.102 6.122 4.102 3.376 0 6.122-1.843 6.122-4.102 0-.199-.02-.394-.058-.584a1.652 1.652 0 00.886-1.448z"
};
const VARIANT_KEYS_BY_PLATFORM = {
  instagram: "Instagram",
  tiktok: "TikTok",
  twitter: "X",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  reddit: "Reddit"
};

function normalizePlatform(platform = "") {
  return PLATFORM_OPTIONS.includes(platform) ? platform : "instagram";
}

function readVariant(post, platform) {
  const key = VARIANT_KEYS_BY_PLATFORM[platform];
  if (!key) return "";
  return String(post?.platformVariants?.[key] || "");
}

function normalizeHandle(value = "") {
  const clean = String(value || "").trim().replace(/^@+/, "");
  return clean || "brand";
}

function toMockupPayload(post, options = {}) {
  const profile = options.profileSettings || {};
  const media = getPrimaryMedia(post, options.mediaMap || new Map());
  const handle = normalizeHandle(profile.handle || profile.displayName || "brand");
  const name = String(profile.displayName || "Client").trim() || "Client";
  const title = String(post?.title || "").trim() || "Untitled Post";
  const text = String(readVariant(post, "instagram") || post.caption || "").trim() || "Start writing your caption to preview your post.";
  const image = media?.urlPath || "";

  const byPlatformText = {
    instagram: String(readVariant(post, "instagram") || text),
    tiktok: String(readVariant(post, "tiktok") || text),
    twitter: String(readVariant(post, "twitter") || text),
    facebook: String(readVariant(post, "facebook") || text),
    linkedin: String(readVariant(post, "linkedin") || text),
    reddit: String(readVariant(post, "reddit") || text)
  };

  return {
    title,
    name,
    handle,
    textByPlatform: byPlatformText,
    image,
    hasImage: Boolean(image)
  };
}

function mediaNode(payload, alt = "Post media", className = "") {
  if (!payload.hasImage) {
    return `<div class="spm-media-fallback">No media uploaded</div>`;
  }
  return `<img src="${escapeHtml(payload.image)}" alt="${escapeHtml(alt)}" class="${className}" loading="lazy" />`;
}

function platformSwitcherIcon(platform) {
  const path = PLATFORM_SWITCHER_ICON_PATHS[platform] || PLATFORM_SWITCHER_ICON_PATHS.instagram;
  return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="currentColor" d="${path}"/></svg>`;
}

function instagramMarkup(payload) {
  return `
    <article class="spm-card spm-ig">
      <header class="spm-head"><span>@${escapeHtml(payload.handle)}</span><i data-lucide="more-horizontal"></i></header>
      <div class="spm-media spm-ig-media">${mediaNode(payload, "Instagram post", "spm-img")}</div>
      <div class="spm-body">
        <div class="spm-row"><i data-lucide="heart"></i><i data-lucide="message-circle"></i><i data-lucide="send"></i><i data-lucide="bookmark" class="spm-right"></i></div>
        <p class="spm-copy"><strong>${escapeHtml(payload.handle)}</strong> ${escapeHtml(payload.textByPlatform.instagram)}</p>
      </div>
    </article>
  `;
}

function tiktokMarkup(payload) {
  return `
    <article class="spm-card spm-tt">
      <div class="spm-tt-bg">${mediaNode(payload, "TikTok background", "spm-img")}</div>
      <div class="spm-tt-overlay">
        <div class="spm-tt-rail"><i data-lucide="heart"></i><i data-lucide="message-circle"></i><i data-lucide="bookmark"></i><i data-lucide="share"></i></div>
        <div class="spm-tt-copy"><strong>@${escapeHtml(payload.handle)}</strong><p>${escapeHtml(payload.textByPlatform.tiktok)}</p></div>
      </div>
    </article>
  `;
}

function twitterMarkup(payload) {
  return `
    <article class="spm-card spm-x">
      <div class="spm-body">
        <p class="spm-meta"><strong>${escapeHtml(payload.name)}</strong> · @${escapeHtml(payload.handle)} · 2h</p>
        <p class="spm-copy">${escapeHtml(payload.textByPlatform.twitter)}</p>
        <div class="spm-media spm-x-media">${mediaNode(payload, "X post", "spm-img")}</div>
        <div class="spm-row"><i data-lucide="message-circle"></i><i data-lucide="repeat-2"></i><i data-lucide="heart"></i><i data-lucide="share"></i></div>
      </div>
    </article>
  `;
}

function facebookMarkup(payload) {
  return `
    <article class="spm-card spm-fb">
      <div class="spm-body">
        <p class="spm-meta"><strong>${escapeHtml(payload.name)}</strong> · 2h</p>
        <p class="spm-copy">${escapeHtml(payload.textByPlatform.facebook)}</p>
      </div>
      <div class="spm-media spm-fb-media">${mediaNode(payload, "Facebook post", "spm-img")}</div>
    </article>
  `;
}

function linkedinMarkup(payload) {
  return `
    <article class="spm-card spm-li">
      <div class="spm-body">
        <p class="spm-meta"><strong>${escapeHtml(payload.name)}</strong> · Senior Social Media Manager</p>
        <p class="spm-copy">${escapeHtml(payload.textByPlatform.linkedin)}</p>
      </div>
      <div class="spm-media spm-li-media">${mediaNode(payload, "LinkedIn post", "spm-img")}</div>
    </article>
  `;
}

function redditMarkup(payload) {
  return `
    <article class="spm-card spm-rd">
      <div class="spm-body">
        <p class="spm-meta">r/socialmedia · Posted by u/${escapeHtml(payload.handle)}</p>
        <h4 class="spm-title">${escapeHtml(payload.title)}</h4>
        <p class="spm-copy">${escapeHtml(payload.textByPlatform.reddit)}</p>
      </div>
      <div class="spm-media spm-rd-media">${mediaNode(payload, "Reddit post", "spm-img")}</div>
    </article>
  `;
}

function renderPlatformMarkup(platform, payload) {
  if (platform === "tiktok") return tiktokMarkup(payload);
  if (platform === "twitter") return twitterMarkup(payload);
  if (platform === "facebook") return facebookMarkup(payload);
  if (platform === "linkedin") return linkedinMarkup(payload);
  if (platform === "reddit") return redditMarkup(payload);
  return instagramMarkup(payload);
}

export function renderSocialMockupPreview(post, options = {}) {
  const selected = normalizePlatform(options.previewPlatform);
  const selectedIndex = Math.max(0, PLATFORM_OPTIONS.indexOf(selected));
  const payload = toMockupPayload(post, options);
  return `
    <section class="spm-shell" data-social-mockup data-preview-platform="${selected}">
      <div class="spm-stage" data-spm-stage>${renderPlatformMarkup(selected, payload)}</div>
      <div class="spm-switch" role="group" aria-label="Post mockup platform" style="--spm-count:${PLATFORM_OPTIONS.length}; --spm-active-index:${selectedIndex}">
        <div class="spm-switch-indicator" aria-hidden="true"></div>
        ${PLATFORM_OPTIONS.map((platform) => {
          const meta = PLATFORM_META[platform] || PLATFORM_META.instagram;
          const isActive = platform === selected;
          return `
            <button
              type="button"
              class="spm-switch-btn ${isActive ? "active" : ""}"
              data-spm-platform="${platform}"
              aria-label="${escapeHtml(meta.label)}"
              title="${escapeHtml(meta.label)}"
            >
              <span class="spm-switch-icon-wrap" aria-hidden="true">
                <span class="spm-switch-icon" aria-hidden="true">${platformSwitcherIcon(platform)}</span>
              </span>
              <span class="spm-tooltip">${escapeHtml(meta.label)}</span>
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

export function initSocialMockupPreview(root, post, options = {}) {
  const shell = root.querySelector("[data-social-mockup]");
  if (!shell) return;
  const stage = shell.querySelector("[data-spm-stage]");
  if (!stage) return;

  const buildLivePostSnapshot = () => {
    const nextPost = {
      ...post,
      title: root.querySelector("#f-title")?.value ?? post.title,
      caption: root.querySelector("#f-caption")?.value ?? post.caption,
      platformVariants: { ...(post.platformVariants || {}) }
    };
    for (const platform of PLATFORM_OPTIONS) {
      const variantFieldId = platform === "twitter" ? "#variant-x" : `#variant-${platform}`;
      const field = root.querySelector(variantFieldId);
      if (!field) continue;
      const variantKey = VARIANT_KEYS_BY_PLATFORM[platform];
      if (!variantKey) continue;
      nextPost.platformVariants[variantKey] = field.value;
    }
    return nextPost;
  };

  let current = normalizePlatform(shell.getAttribute("data-preview-platform") || "instagram");
  const switchRail = shell.querySelector(".spm-switch");

  const paint = () => {
    current = normalizePlatform(current);
    const payload = toMockupPayload(buildLivePostSnapshot(), options);
    const activeIndex = Math.max(0, PLATFORM_OPTIONS.indexOf(current));
    if (switchRail) {
      switchRail.style.setProperty("--spm-active-index", String(activeIndex));
    }
    shell.setAttribute("data-preview-platform", current);
    stage.innerHTML = renderPlatformMarkup(current, payload);
    shell.querySelectorAll("[data-spm-platform]").forEach((button) => {
      button.classList.toggle("active", button.getAttribute("data-spm-platform") === current);
    });
    options.onPlatformChange?.(current);
    window.lucide?.createIcons();
  };

  shell.querySelectorAll("[data-spm-platform]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.getAttribute("data-spm-platform") || "instagram";
      current = normalizePlatform(next);
      paint();
    });
  });

  const inputHandler = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const id = target.id || "";
    if (id === "f-title" || id === "f-caption" || id.startsWith("variant-")) {
      paint();
    }
  };
  if (root._socialMockupInputHandler) {
    root.removeEventListener("input", root._socialMockupInputHandler);
  }
  root._socialMockupInputHandler = inputHandler;
  root.addEventListener("input", inputHandler);

  paint();
}
