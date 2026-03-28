import { escapeHtml, normalizePostType, buildMediaMap, getPrimaryMedia, renderPreviewMedia } from "./shared.js";

function instagramTile(post, mediaMap, showDraftLabels = true) {
  const type = normalizePostType(post.postType);
  const stateBadge = !showDraftLabels || post.publishState === "published" ? "" : `<span class="mock-badge">${escapeHtml(post.publishState)}</span>`;
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

function toInstagramCard(posts, mediaMap, profile, showDraftLabels = true) {
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
        ${posts.length ? posts.map((post) => instagramTile(post, mediaMap, showDraftLabels)).join("") : `<div class="grid-empty">No Instagram posts yet.</div>`}
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

function renderSettingsPanel(profile, settingsOpen = false) {
  return `
    <details class="simulator-settings" data-simulator-settings ${settingsOpen ? "open" : ""}>
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
  const showDraftLabels = options?.showDraftLabels !== false;
  const onModeChange = options?.onModeChange;
  const onToggleDraftLabels = options?.onToggleDraftLabels;
  const onProfileSettingsChange = options?.onProfileSettingsChange;
  const onSettingsOpenChange = options?.onSettingsOpenChange;
  const settingsOpen = Boolean(options?.settingsOpen);
  const mediaMap = buildMediaMap(options?.media || []);
  const profile = {
    handle: "brand",
    displayName: "Client",
    avatarUrl: "https://picsum.photos/seed/client-avatar/300/300",
    followers: "—",
    following: "—",
    likes: "—",
    bio: "Profile bio",
    linkText: "website",
    linkUrl: "#",
    ...(options?.profileSettings || {})
  };

  const eligiblePosts = getPlatformPosts(posts, mode);

  root.innerHTML = `
    <div class="profile-toolbar">
      <div class="mode-switch">
        <button class="small ${mode === "instagram" ? "active" : ""}" data-mode="instagram">Instagram</button>
        <button class="small ${mode === "tiktok" ? "active" : ""}" data-mode="tiktok">TikTok</button>
        <button class="profile-toggle ${showDraftLabels ? "active" : ""}" type="button" data-toggle-draft-labels>${showDraftLabels ? "Draft Labels: On" : "Draft Labels: Off"}</button>
      </div>
      <span class="subtle">${escapeHtml(options?.clientName || "All Clients")} • ${eligiblePosts.length} mapped thumbnails</span>
    </div>
    ${renderSettingsPanel(profile, settingsOpen)}
    ${mode === "instagram" ? toInstagramCard(eligiblePosts, mediaMap, profile, showDraftLabels) : toTiktokCard(eligiblePosts, mediaMap, profile)}
  `;

  root.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => onModeChange?.(button.dataset.mode));
  });
  root.querySelector("[data-toggle-draft-labels]")?.addEventListener("click", () => onToggleDraftLabels?.(!showDraftLabels));
  const settingsDetails = root.querySelector("[data-simulator-settings]");
  settingsDetails?.addEventListener("toggle", () => {
    onSettingsOpenChange?.(settingsDetails.open);
  });

  root.querySelectorAll("[data-profile-setting]").forEach((field) => {
    const emitChange = () => {
      onProfileSettingsChange?.({ [field.dataset.profileSetting]: field.value });
    };
    field.addEventListener("change", emitChange);
    field.addEventListener("blur", emitChange);
  });

  window.lucide?.createIcons();
}
