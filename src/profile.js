export const PROFILE_SETTING_KEYS = new Set([
  "handle",
  "displayName",
  "avatarUrl",
  "followers",
  "following",
  "likes",
  "bio",
  "linkText",
  "linkUrl"
]);

export const DEFAULT_PROFILE_SETTINGS = {
  handle: "brand",
  displayName: "Client",
  avatarUrl: "https://picsum.photos/seed/client-avatar/300/300",
  followers: "—",
  following: "—",
  likes: "—",
  bio: "Profile bio",
  linkText: "website",
  linkUrl: "#"
};

export function normalizeProfileSettings(settings = {}) {
  return { ...DEFAULT_PROFILE_SETTINGS, ...(settings || {}) };
}

export function sanitizeProfileSettingsPatch(patch = {}) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return {};
  const next = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!PROFILE_SETTING_KEYS.has(key)) continue;
    if (value === undefined || value === null) continue;
    next[key] = String(value);
  }
  return next;
}

export function toHandleFromClientName(name = "") {
  const slug = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return slug || DEFAULT_PROFILE_SETTINGS.handle;
}

export function buildClientDerivedProfileDefaults(client) {
  if (!client) return { ...DEFAULT_PROFILE_SETTINGS };
  const clientName = String(client.name || "").trim() || DEFAULT_PROFILE_SETTINGS.displayName;
  const avatarSeed = encodeURIComponent(client.shareSlug || client.id || clientName.toLowerCase());
  return {
    ...DEFAULT_PROFILE_SETTINGS,
    handle: toHandleFromClientName(clientName),
    displayName: clientName,
    avatarUrl: `https://picsum.photos/seed/${avatarSeed}/300/300`
  };
}

export function resolveProfileSettingsForClient(state, clientId = "") {
  const targetClient =
    state.clients.find((client) => client.id === clientId) ||
    state.clients.find((client) => client.id === state.activeClientId) ||
    state.clients[0] ||
    null;
  const clientDefaults = buildClientDerivedProfileDefaults(targetClient);
  const fromClient = sanitizeProfileSettingsPatch(targetClient?.profileSettings || {});
  return normalizeProfileSettings({ ...clientDefaults, ...fromClient });
}
