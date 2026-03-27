import { createStore, sortByProfileOrder } from "./store.js";
import { renderCalendar, renderInspector, renderKanban, renderProfileSimulator, renderShareCalendar } from "./render.js";
import { getAuthToken, login, setAuthToken } from "./api.js";

const store = createStore();
const STORAGE_UI_VIEWS = "soci.ui.views.v1";
const STORAGE_UI_SECTIONS = "soci.ui.sections.v1";
const STORAGE_THEME = "soci.theme.v1";
const PROFILE_SETTING_KEYS = new Set([
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

const DEFAULT_PROFILE_SETTINGS = {
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

const el = {
  brandHome: document.querySelector("#brand-home"),
  viewToggles: [...document.querySelectorAll("[data-view]")],
  viewTitle: document.querySelector("#view-title"),
  stats: document.querySelector("#stats"),
  activeClient: document.querySelector("#active-client"),
  newClient: document.querySelector("#new-client"),
  manageUsers: document.querySelector("#manage-users"),
  copyShareLink: document.querySelector("#copy-share-link"),
  exportCsv: document.querySelector("#export-csv"),
  exportIcs: document.querySelector("#export-ics"),
  filterQuery: document.querySelector("#filter-query"),
  filterPlatform: document.querySelector("#filter-platform"),
  filterStatus: document.querySelector("#filter-status"),
  filterAssignee: document.querySelector("#filter-assignee"),
  adminUserPanel: document.querySelector("#admin-user-panel"),
  collapseAdminUser: document.querySelector("#collapse-admin-user"),
  adminUserForm: document.querySelector("#admin-user-form"),
  adminUserName: document.querySelector("#admin-user-name"),
  adminUserEmail: document.querySelector("#admin-user-email"),
  adminUserRole: document.querySelector("#admin-user-role"),
  adminUserPassword: document.querySelector("#admin-user-password"),
  adminAssignMembership: document.querySelector("#admin-assign-membership"),
  adminMembershipClient: document.querySelector("#admin-membership-client"),
  adminMembershipPermissions: document.querySelector("#admin-membership-permissions"),
  adminUserError: document.querySelector("#admin-user-error"),
  adminUserCancel: document.querySelector("#admin-user-cancel"),
  leftSidebar: document.querySelector("#left-sidebar"),
  collapseLeftSidebar: document.querySelector("#collapse-left-sidebar"),
  reopenLeftSidebar: document.querySelector("#reopen-left-sidebar"),
  workflowSection: document.querySelector("#workflow-section"),
  scheduleSection: document.querySelector("#schedule-section"),
  previewSection: document.querySelector("#preview-section"),
  collapseWorkflow: document.querySelector("#collapse-workflow"),
  kanbanOverflowHint: document.querySelector("#kanban-overflow-hint"),
  collapseSchedule: document.querySelector("#collapse-schedule"),
  collapsePreview: document.querySelector("#collapse-preview"),
  inspectorPanel: document.querySelector("#inspector-panel"),
  collapseRightSidebar: document.querySelector("#collapse-right-sidebar"),
  reopenRightSidebar: document.querySelector("#reopen-right-sidebar"),
  kanban: document.querySelector("#kanban-view"),
  calendar: document.querySelector("#calendar-view"),
  grid: document.querySelector("#grid-view"),
  inspector: document.querySelector("#inspector"),
  createBtn: document.querySelector("#create-post"),
  toast: document.querySelector("#toast"),
  themeToggle: document.querySelector("#theme-toggle")
};

const ADMIN_ROLES = new Set(["owner_admin", "admin"]);

let profileMode = "instagram";
let simulatorSettingsOpen = false;
let showDraftLabels = true;
let calendarOffset = 0; // months from current
let shareCalendarOffset = 0;
let lastState = { posts: [], media: [], activePostId: null, clients: [], activeClientId: "", isBootstrapped: false };
let visibleViews = loadJson(STORAGE_UI_VIEWS, { kanban: true, calendar: true, grid: false });
let collapsedSections = loadJson(STORAGE_UI_SECTIONS, { workflow: false, schedule: false, preview: false, adminUser: false, leftSidebar: false, rightSidebar: false, inspector: false });
if (typeof collapsedSections.rightSidebar !== "boolean") {
  collapsedSections.rightSidebar = Boolean(collapsedSections.inspector);
}
if (typeof collapsedSections.leftSidebar !== "boolean") {
  collapsedSections.leftSidebar = false;
}
if (typeof collapsedSections.adminUser !== "boolean") {
  collapsedSections.adminUser = false;
}
const filters = {
  clientId: "",
  query: "",
  platform: "all",
  status: "all",
  assignee: "all"
};

const shareState = {
  token: "",
  loading: false,
  client: null,
  posts: [],
  error: ""
};

let themeMode = ["light", "dark"].includes(localStorage.getItem(STORAGE_THEME))
  ? localStorage.getItem(STORAGE_THEME)
  : "";

store.setErrorHandler((message, error) => {
  if (error?.isAuthError) {
    setAuthToken(null);
    showLogin();
    return;
  }
  showToast(message, "error");
});

// ── Toast system ─────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(message, type = "") {
  el.toast.textContent = message;
  el.toast.className = `toast${type ? " " + type : ""} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.classList.remove("show");
  }, 2500);
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function normalizeProfileSettings(settings = {}) {
  return { ...DEFAULT_PROFILE_SETTINGS, ...(settings || {}) };
}

function sanitizeProfileSettingsPatch(patch = {}) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return {};
  const next = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!PROFILE_SETTING_KEYS.has(key)) continue;
    if (value === undefined || value === null) continue;
    next[key] = String(value);
  }
  return next;
}

function toHandleFromClientName(name = "") {
  const slug = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return slug || DEFAULT_PROFILE_SETTINGS.handle;
}

function buildClientDerivedProfileDefaults(client) {
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

function resolveProfileSettingsForClient(state, clientId = "") {
  const targetClient =
    state.clients.find((client) => client.id === clientId) ||
    state.clients.find((client) => client.id === state.activeClientId) ||
    state.clients[0] ||
    null;
  const clientDefaults = buildClientDerivedProfileDefaults(targetClient);
  const fromClient = sanitizeProfileSettingsPatch(targetClient?.profileSettings || {});
  return normalizeProfileSettings({ ...clientDefaults, ...fromClient });
}

function resolveSimulatorClient(state) {
  const selectedClientId = filters.clientId || state.activeClientId || state.clients[0]?.id || "";
  const selectedClient = state.clients.find((client) => client.id === selectedClientId) || null;
  return {
    clientId: selectedClient?.id || "",
    clientName: selectedClient?.name || "All Clients"
  };
}

function persistUiState() {
  localStorage.setItem(STORAGE_UI_VIEWS, JSON.stringify(visibleViews));
  localStorage.setItem(STORAGE_UI_SECTIONS, JSON.stringify(collapsedSections));
}

function refreshIcons() {
  window.lucide?.createIcons();
}

function applyTheme() {
  if (themeMode === "light" || themeMode === "dark") {
    document.documentElement.setAttribute("data-theme", themeMode);
  } else {
    document.documentElement.removeAttribute("data-theme");
    themeMode = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  if (el.themeToggle) {
    const nextTheme = themeMode === "dark" ? "light" : "dark";
    const icon = nextTheme === "light" ? "sun" : "moon";
    const label = nextTheme === "light" ? "Light Mode" : "Dark Mode";
    el.themeToggle.innerHTML = `<i data-lucide="${icon}" aria-hidden="true"></i><span>${label}</span>`;
    el.themeToggle.setAttribute("aria-label", `Switch to ${themeMode === "dark" ? "light" : "dark"} mode`);
    refreshIcons();
  }
}

function getMonthOffsetFromDate(dateString = "") {
  if (!dateString) return 0;
  const target = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(target.getTime())) return 0;
  const now = new Date();
  const nowMonthIndex = now.getFullYear() * 12 + now.getMonth();
  const targetMonthIndex = target.getFullYear() * 12 + target.getMonth();
  return targetMonthIndex - nowMonthIndex;
}

function formatFriendlyDate(value = "") {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function getNextScheduledEvent(posts = []) {
  const scheduled = posts
    .filter((post) => post.scheduleDate)
    .map((post) => ({ ...post, _date: new Date(`${post.scheduleDate}T00:00:00`) }))
    .filter((post) => !Number.isNaN(post._date.getTime()))
    .sort((a, b) => a._date - b._date);
  if (!scheduled.length) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = scheduled.find((post) => post._date >= today) || scheduled[0];
  return {
    date: upcoming.scheduleDate,
    label: formatFriendlyDate(upcoming.scheduleDate)
  };
}

function syncKanbanOverflowState() {
  const workflow = el.workflowSection;
  const kanban = el.kanban;
  const hint = el.kanbanOverflowHint;
  if (!workflow || !kanban) return;

  const update = () => {
    const maxScrollLeft = Math.max(kanban.scrollWidth - kanban.clientWidth, 0);
    const hasOverflow = maxScrollLeft > 6;
    const atStart = kanban.scrollLeft <= 2;
    const atEnd = kanban.scrollLeft >= maxScrollLeft - 2;

    workflow.classList.toggle("overflow-left", hasOverflow && !atStart);
    workflow.classList.toggle("overflow-right", hasOverflow && !atEnd);
    hint?.classList.toggle("hidden", !hasOverflow || !atStart);
  };

  if (!kanban.dataset.overflowBound) {
    kanban.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    kanban.dataset.overflowBound = "1";
  }

  requestAnimationFrame(update);
}

function toggleTheme() {
  themeMode = themeMode === "dark" ? "light" : "dark";
  localStorage.setItem(STORAGE_THEME, themeMode);
  applyTheme();
}

el.themeToggle?.addEventListener("click", toggleTheme);
applyTheme();

// ── Helpers ──────────────────────────────────────────────────────────────────
function escapeHtml(value = "") {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function listAssignees(posts) {
  return [...new Set(posts.map((p) => (p.assignee || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function collectHashtagSuggestions(posts) {
  const counts = new Map();
  for (const post of posts) {
    const fromTags = Array.isArray(post.tags) ? post.tags : [];
    for (const tag of fromTags) {
      const normalized = String(tag || "").trim().toLowerCase().replace(/^#/, "");
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }
    const caption = String(post.caption || "");
    const hashMatches = [...caption.matchAll(/#([a-z0-9_]+)/gi)].map((match) => match[1].toLowerCase());
    for (const hash of hashMatches) {
      counts.set(hash, (counts.get(hash) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

function syncAssigneeFilter(posts) {
  const assignees = listAssignees(posts);
  const selected = filters.assignee;
  el.filterAssignee.innerHTML = `<option value="all">All Assignees</option>${assignees.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`;
  el.filterAssignee.value = assignees.includes(selected) ? selected : "all";
  filters.assignee = el.filterAssignee.value;
}

function syncClientFilter(clients, activeClientId) {
  const selected = filters.clientId || activeClientId || "";
  el.activeClient.innerHTML = `<option value="">All Clients</option>${clients.map((client) => `<option value="${client.id}">${escapeHtml(client.name)}</option>`).join("")}`;
  el.activeClient.value = clients.some((c) => c.id === selected) ? selected : "";
  filters.clientId = el.activeClient.value;
}

function matchesFilters(post) {
  if (filters.clientId && post.clientId !== filters.clientId) return false;
  if (filters.platform !== "all" && !post.platforms.includes(filters.platform)) return false;
  if (filters.status !== "all" && post.status !== filters.status) return false;
  if (filters.assignee !== "all" && (post.assignee || "").trim() !== filters.assignee) return false;

  const query = filters.query.trim().toLowerCase();
  if (!query) return true;
  const haystack = `${post.title} ${post.caption} ${(post.tags || []).join(" ")}`.toLowerCase();
  return haystack.includes(query);
}

function applyStatusRules(patch, existing) {
  const next = { ...patch };
  if (!next.clientId) {
    showToast("Assign a client before saving.", "error");
    return null;
  }
  if ((next.status === "in-review" || next.status === "ready") && !next.scheduleDate) {
    showToast("Schedule date is required for In Review / Ready.", "error");
    next.status = existing.status;
  }
  if (next.status === "ready" && !next.checklist?.approval) {
    showToast("Approval must be checked before moving to Ready.", "error");
    next.status = existing.status;
  }
  return next;
}

function getSelectedClient(state) {
  if (!filters.clientId) return null;
  return state.clients.find((c) => c.id === filters.clientId) || null;
}

function getShareToken() {
  const hash = location.hash.replace(/^#/, "");
  if (!hash.startsWith("share=")) return "";
  return decodeURIComponent(hash.slice(6));
}

function toClientSharePosts(state, clientId) {
  return sortByProfileOrder(state.posts).filter((post) => post.clientId === clientId && post.visibility === "client-shareable" && post.scheduleDate);
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCsv(client, posts) {
  const header = ["title", "date", "platforms", "status", "publish_state", "caption"];
  const rows = posts.map((p) => [p.title, p.scheduleDate, p.platforms.join("|"), p.status, p.publishState, p.caption].map((v) => `"${String(v || "").replaceAll('"', '""')}"`).join(","));
  downloadFile(`${client.shareSlug}-calendar.csv`, [header.join(","), ...rows].join("\n"), "text/csv;charset=utf-8");
}

function exportIcs(client, posts) {
  const events = posts.map((post) => {
    const stamp = `${post.scheduleDate.replaceAll("-", "")}T090000`;
    const uid = `${post.id}@soci.local`;
    const summary = (post.title || "Untitled").replace(/[,;\\]/g, "");
    const desc = (post.caption || "").replace(/\n/g, "\\n").replace(/[,;\\]/g, "");
    return [
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTART:${stamp}`,
      `DTEND:${stamp}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${desc}`,
      "END:VEVENT"
    ].join("\n");
  });
  const file = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Soci//Calendar//EN", ...events, "END:VCALENDAR"].join("\n");
  downloadFile(`${client.shareSlug}-calendar.ics`, file, "text/calendar;charset=utf-8");
}

function setViewVisible(view, nextValue) {
  const next = { ...visibleViews, [view]: nextValue };
  const activeCount = Object.values(next).filter(Boolean).length;
  if (activeCount === 0) {
    showToast("At least one view must stay visible.", "warning");
    return;
  }
  visibleViews = next;
  persistUiState();
}

function toggleCollapse(sectionKey) {
  collapsedSections = { ...collapsedSections, [sectionKey]: !collapsedSections[sectionKey] };
  persistUiState();
  applyUiState();
}

function revealView(view, sectionKey) {
  if (!visibleViews[view]) setViewVisible(view, true);
  if (sectionKey && collapsedSections[sectionKey]) {
    collapsedSections = { ...collapsedSections, [sectionKey]: false };
    persistUiState();
  }
  applyUiState();
}

function applyUiState() {
  const leftCollapsed = Boolean(collapsedSections.leftSidebar);
  const rightCollapsed = Boolean(collapsedSections.rightSidebar);

  document.body.classList.toggle("left-collapsed", leftCollapsed);
  document.body.classList.toggle("right-collapsed", rightCollapsed);
  document.body.classList.toggle("both-collapsed", leftCollapsed && rightCollapsed);

  el.workflowSection.classList.toggle("hidden", !visibleViews.kanban);
  el.scheduleSection.classList.toggle("hidden", !visibleViews.calendar);
  el.previewSection.classList.toggle("hidden", !visibleViews.grid);

  const showAdminPanel = canManageUsers() && !el.adminUserPanel?.classList.contains("hidden");
  el.adminUserPanel?.classList.toggle("is-collapsed", collapsedSections.adminUser);
  el.collapseAdminUser && (el.collapseAdminUser.textContent = collapsedSections.adminUser ? "Expand" : "Collapse");
  if (!canManageUsers()) {
    el.adminUserPanel?.classList.add("hidden");
  } else if (showAdminPanel) {
    el.adminUserPanel?.classList.remove("hidden");
  }

  el.leftSidebar.classList.toggle("is-collapsed", leftCollapsed);
  el.inspectorPanel.classList.toggle("is-collapsed", rightCollapsed);
  el.workflowSection.classList.toggle("is-collapsed", collapsedSections.workflow);
  el.scheduleSection.classList.toggle("is-collapsed", collapsedSections.schedule);
  el.previewSection.classList.toggle("is-collapsed", collapsedSections.preview);

  el.collapseLeftSidebar.textContent = leftCollapsed ? "Expand" : "Collapse";
  el.reopenLeftSidebar.classList.toggle("hidden", !leftCollapsed);
  el.collapseRightSidebar.textContent = rightCollapsed ? "Expand" : "Collapse";
  el.reopenRightSidebar.classList.toggle("hidden", !rightCollapsed);

  el.collapseWorkflow.textContent = collapsedSections.workflow ? "Expand" : "Collapse";
  el.collapseSchedule.textContent = collapsedSections.schedule ? "Expand" : "Collapse";
  el.collapsePreview.textContent = collapsedSections.preview ? "Expand" : "Collapse";

  for (const toggle of el.viewToggles) {
    toggle.classList.toggle("active", Boolean(visibleViews[toggle.dataset.view]));
  }

  syncKanbanOverflowState();
}

function canManageUsers() {
  if (typeof store.canManageUsers === "function") return store.canManageUsers();
  const role = store.getCurrentUser()?.role || "";
  return ADMIN_ROLES.has(role);
}

function syncRoleActions() {
  if (el.manageUsers) el.manageUsers.classList.toggle("hidden", !canManageUsers());
  if (!canManageUsers()) {
    el.adminUserPanel?.classList.add("hidden");
  }
}

function syncActionPermissions(state) {
  const canCreatePosts = typeof store.canCreatePosts === "function" ? store.canCreatePosts() : true;
  const canManageClients = typeof store.canManageClients === "function" ? store.canManageClients() : true;
  if (el.createBtn) {
    el.createBtn.disabled = !canCreatePosts;
    el.createBtn.title = canCreatePosts ? "" : "You do not have permission to create posts.";
  }
  if (el.newClient) {
    el.newClient.disabled = !canManageClients;
    el.newClient.title = canManageClients ? "" : "You do not have permission to create clients.";
  }
  if (el.copyShareLink) el.copyShareLink.disabled = !canManageUsers();
  if (el.exportCsv) el.exportCsv.disabled = !canManageUsers();
  if (el.exportIcs) el.exportIcs.disabled = !canManageUsers();

  const authContext = state?.authContext || {};
  const canUploadAny = authContext?.capabilities?.canUploadMedia;
  if (typeof canUploadAny === "boolean") {
    document.body.classList.toggle("no-upload-permission", !canUploadAny);
  }
}

function setAdminUserError(message = "") {
  if (!el.adminUserError) return;
  if (!message) {
    el.adminUserError.classList.add("hidden");
    el.adminUserError.textContent = "";
    return;
  }
  el.adminUserError.textContent = message;
  el.adminUserError.classList.remove("hidden");
}

function syncAdminMembershipClientOptions(clients) {
  if (!el.adminMembershipClient) return;
  const selected = el.adminMembershipClient.value;
  el.adminMembershipClient.innerHTML = `<option value="">Select client...</option>${clients
    .map((client) => `<option value="${client.id}">${escapeHtml(client.name)}</option>`)
    .join("")}`;
  el.adminMembershipClient.value = clients.some((client) => client.id === selected) ? selected : "";
}

function syncMembershipControls() {
  const assigning = el.adminAssignMembership?.value === "yes";
  if (el.adminMembershipClient) {
    el.adminMembershipClient.disabled = !assigning;
    if (!assigning) el.adminMembershipClient.value = "";
  }
  if (el.adminMembershipPermissions) {
    el.adminMembershipPermissions.disabled = !assigning;
    if (!assigning) el.adminMembershipPermissions.value = "view,comment";
  }
}

function openAdminUserPanel() {
  if (!canManageUsers()) {
    showToast("Only admins can manage users.", "warning");
    return;
  }
  el.adminUserPanel?.classList.remove("hidden");
  setAdminUserError("");
  applyUiState();
  el.adminUserName?.focus();
}

function closeAdminUserPanel() {
  el.adminUserPanel?.classList.add("hidden");
  setAdminUserError("");
  collapsedSections = { ...collapsedSections, adminUser: false };
  persistUiState();
  applyUiState();
}

for (const toggle of el.viewToggles) {
  toggle.addEventListener("click", () => {
    const view = toggle.dataset.view;
    setViewVisible(view, !visibleViews[view]);
    applyUiState();
  });
}

el.collapseWorkflow.addEventListener("click", () => toggleCollapse("workflow"));
el.collapseSchedule.addEventListener("click", () => toggleCollapse("schedule"));
el.collapsePreview.addEventListener("click", () => toggleCollapse("preview"));
el.collapseAdminUser?.addEventListener("click", () => toggleCollapse("adminUser"));
el.collapseLeftSidebar.addEventListener("click", () => toggleCollapse("leftSidebar"));
el.collapseRightSidebar.addEventListener("click", () => toggleCollapse("rightSidebar"));
el.reopenLeftSidebar.addEventListener("click", () => {
  collapsedSections = { ...collapsedSections, leftSidebar: false };
  persistUiState();
  applyUiState();
});
el.reopenRightSidebar.addEventListener("click", () => {
  collapsedSections = { ...collapsedSections, rightSidebar: false };
  persistUiState();
  applyUiState();
});

el.createBtn.addEventListener("click", () => {
  if (typeof store.canCreatePosts === "function" && !store.canCreatePosts()) {
    showToast("You do not have permission to create posts.", "warning");
    return;
  }
  store.createPost();
});

el.newClient.addEventListener("click", () => {
  if (typeof store.canManageClients === "function" && !store.canManageClients()) {
    showToast("You do not have permission to create clients.", "warning");
    return;
  }
  const name = prompt("Client name:");
  if (!name?.trim()) return;
  store.createClient(name.trim());
  showToast("Client added.", "success");
});

el.manageUsers?.addEventListener("click", () => {
  openAdminUserPanel();
});

el.brandHome?.addEventListener("click", () => {
  if (location.hash.startsWith("#share=")) {
    history.replaceState(null, "", `${location.pathname}${location.search}`);
  }
  visibleViews = { ...visibleViews, kanban: true, calendar: true };
  collapsedSections = {
    ...collapsedSections,
    workflow: false,
    schedule: false,
    preview: false,
    leftSidebar: false,
    rightSidebar: false,
    adminUser: false
  };
  persistUiState();
  applyUiState();
  paint(lastState);
});

el.adminUserCancel?.addEventListener("click", closeAdminUserPanel);
el.adminAssignMembership?.addEventListener("change", syncMembershipControls);

el.adminUserForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canManageUsers()) {
    setAdminUserError("Only admins can manage users.");
    return;
  }

  const name = el.adminUserName?.value.trim() || "";
  const email = el.adminUserEmail?.value.trim().toLowerCase() || "";
  const role = el.adminUserRole?.value || "client_user";
  const password = el.adminUserPassword?.value || "";
  const assignMembership = el.adminAssignMembership?.value === "yes";
  const membershipClientId = el.adminMembershipClient?.value || "";
  const permissions = String(el.adminMembershipPermissions?.value || "view,comment")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!name) return setAdminUserError("Display name is required.");
  if (!email) return setAdminUserError("Email is required.");
  if (!["helper_staff", "client_user"].includes(role)) return setAdminUserError("Invalid role selection.");
  if (password.length < 8) return setAdminUserError("Password must be at least 8 characters.");
  if (assignMembership && !membershipClientId) return setAdminUserError("Select a client for membership assignment.");

  setAdminUserError("");
  let created;
  try {
    const response = await store.adminCreateUser({ email, name, role, password });
    created = response.user;
    showToast(`User created: ${created.email}`, "success");
  } catch {
    return;
  }

  if (assignMembership && created?.id) {
    try {
      await store.adminAssignMembership({
        userId: created.id,
        clientId: membershipClientId,
        permissions
      });
      showToast("Membership assigned.", "success");
    } catch {
      return;
    }
  }

  el.adminUserForm?.reset();
  syncMembershipControls();
});

el.activeClient.addEventListener("change", () => {
  filters.clientId = el.activeClient.value;
  if (filters.clientId) store.setActiveClient(filters.clientId);
  paint(lastState);
});

el.copyShareLink.addEventListener("click", async () => {
  const client = getSelectedClient(lastState);
  if (!client) return showToast("Select a client first.", "warning");
  let shareUrl = `${location.origin}${location.pathname}#share=${encodeURIComponent(client.shareSlug)}`;
  try {
    const response = await store.createClientShareLink(client.id);
    if (response?.shareUrl) shareUrl = response.shareUrl;
  } catch (error) {
    console.error(error);
    showToast("Using fallback slug share link.", "warning");
  }
  await navigator.clipboard.writeText(shareUrl);
  showToast("Share link copied.", "success");
});

el.exportCsv.addEventListener("click", () => {
  const client = getSelectedClient(lastState);
  if (!client) return showToast("Select a client first.", "warning");
  exportCsv(client, toClientSharePosts(lastState, client.id));
  showToast("CSV exported.", "success");
});

el.exportIcs.addEventListener("click", () => {
  const client = getSelectedClient(lastState);
  if (!client) return showToast("Select a client first.", "warning");
  exportIcs(client, toClientSharePosts(lastState, client.id));
  showToast("ICS exported.", "success");
});

el.filterQuery.addEventListener("input", () => {
  filters.query = el.filterQuery.value;
  paint(lastState);
});
el.filterPlatform.addEventListener("change", () => {
  filters.platform = el.filterPlatform.value;
  paint(lastState);
});
el.filterStatus.addEventListener("change", () => {
  filters.status = el.filterStatus.value;
  paint(lastState);
});
el.filterAssignee.addEventListener("change", () => {
  filters.assignee = el.filterAssignee.value;
  paint(lastState);
});

document.addEventListener("keydown", (event) => {
  if (!(event.metaKey || event.ctrlKey)) return;
  const key = event.key.toLowerCase();
  if (key === "n") {
    event.preventDefault();
    store.createPost();
  }
  if (key === "s") {
    event.preventDefault();
    document.querySelector("#save-post")?.click();
  }
});

// ── Render / paint ───────────────────────────────────────────────────────────
function paint(state) {
  const shareToken = getShareToken();
  if (shareToken) {
    document.body.classList.add("share-mode");
    el.leftSidebar.classList.add("is-collapsed");
    el.inspectorPanel.classList.add("is-collapsed");
    el.workflowSection.classList.add("hidden");
    el.previewSection.classList.add("hidden");
    el.scheduleSection.classList.remove("hidden");
    el.scheduleSection.classList.remove("is-collapsed");

    const loading = shareState.loading && shareState.token === shareToken;
    const hasError = !loading && shareState.error;
    const client = !loading && !hasError ? shareState.client : null;
    const sharePosts = !loading && !hasError ? shareState.posts : [];

    el.viewTitle.textContent = loading
      ? "Shared Calendar (Loading...)"
      : client
      ? `${client.name} Shared Calendar`
      : "Shared Calendar";
    el.stats.textContent = loading
      ? "Loading shared schedule..."
      : hasError
      ? "Invalid or expired share link"
      : `${sharePosts.length} scheduled posts`;

    renderShareCalendar(el.calendar, client || { name: hasError ? "Invalid Share Link" : "Loading" }, sharePosts, shareCalendarOffset, (delta) => {
      shareCalendarOffset += delta;
      paint(lastState);
    });
    return;
  }

  document.body.classList.remove("share-mode");
  syncRoleActions();
  syncActionPermissions(state);
  if (!state.isBootstrapped) {
    el.viewTitle.textContent = "Planning Workspace";
    el.stats.textContent = "Connecting to API...";
    el.kanban.innerHTML = "<div class='empty'>Loading workspace…</div>";
    el.calendar.innerHTML = "";
    el.grid.innerHTML = "";
    el.inspector.innerHTML = "<div class='empty'>Loading…</div>";
    return;
  }

  applyUiState();
  syncMembershipControls();
  const posts = sortByProfileOrder(state.posts);
  syncClientFilter(state.clients, state.activeClientId);
  syncAdminMembershipClientOptions(state.clients);
  syncAssigneeFilter(posts);
  el.viewTitle.textContent = "Planning Workspace";

  const visiblePosts = posts.filter(matchesFilters);
  const activePost = posts.find((p) => p.id === state.activePostId) || null;
  const hashtagSuggestions = collectHashtagSuggestions(posts);
  const simulatorClient = resolveSimulatorClient(state);
  const simulatorPosts = posts.filter((post) => {
    if (simulatorClient.clientId && post.clientId !== simulatorClient.clientId) return false;
    return matchesFilters(post);
  });
  const simulatorProfileSettings = resolveProfileSettingsForClient(state, simulatorClient.clientId);

  const paintProfileSimulator = () => {
    renderProfileSimulator(el.grid, simulatorPosts, {
      mode: profileMode,
      showDraftLabels,
      clientId: simulatorClient.clientId,
      clientName: simulatorClient.clientName,
      media: state.media,
      profileSettings: simulatorProfileSettings,
      settingsOpen: simulatorSettingsOpen,
      onSettingsOpenChange: (nextOpen) => {
        simulatorSettingsOpen = Boolean(nextOpen);
      },
      onModeChange: (nextMode) => {
        profileMode = nextMode;
        paintProfileSimulator();
      },
      onToggleDraftLabels: (nextValue) => {
        showDraftLabels = Boolean(nextValue);
        paintProfileSimulator();
      },
      onProfileSettingsChange: (patch) => {
        if (!simulatorClient.clientId) {
          showToast("Select a client before editing preview settings.", "warning");
          return;
        }
        const safePatch = sanitizeProfileSettingsPatch(patch);
        if (!Object.keys(safePatch).length) return;
        store.updateClientProfileSettings(simulatorClient.clientId, safePatch);
      }
    });
  };

  renderKanban(
    el.kanban,
    visiblePosts,
    (id) => store.setActivePost(id),
    (id, status) => {
      const post = state.posts.find((p) => p.id === id);
      if (!post) return;
      if ((status === "in-review" || status === "ready") && !post.scheduleDate) {
        showToast("Schedule date is required for In Review / Ready.", "error");
        return;
      }
      if (!post.clientId) {
        showToast("Assign a client before moving status.", "error");
        return;
      }
      if (status === "ready" && !post.checklist?.approval) {
        showToast("Approval must be checked before moving to Ready.", "error");
        return;
      }
      store.movePost(id, status);
    }
  );

  renderCalendar(el.calendar, visiblePosts, (id) => {
    store.setActivePost(id);
    revealView("kanban", "workflow");
  }, calendarOffset, (delta) => {
    calendarOffset += delta;
    paint(lastState);
  }, {
    nextEvent: getNextScheduledEvent(visiblePosts),
    onJumpToDate: (dateString) => {
      calendarOffset = getMonthOffsetFromDate(dateString);
      paint(lastState);
    }
  });

  paintProfileSimulator();

  syncKanbanOverflowState();

  renderInspector(el.inspector, activePost, {
    clients: state.clients,
    media: state.media,
    hashtagSuggestions,
    permissions: {
      canEdit: activePost ? store.canEditPost(activePost) : false,
      canComment: activePost ? store.canCommentOnPost(activePost) : false,
      canDelete: canManageUsers(),
      canDuplicate: activePost ? store.canEditPost(activePost) : false,
      canUploadMedia: Boolean(state?.authContext?.capabilities?.canUploadMedia) && (activePost ? store.canEditPost(activePost) : false),
      canReorderMedia: activePost ? store.canEditPost(activePost) : false
    },
    profileSettings: resolveProfileSettingsForClient(state, activePost?.clientId || simulatorClient.clientId),
    onSave: (patch) => {
      if (!activePost) return;
      const applied = applyStatusRules(patch, activePost);
      if (!applied) return;
      store.updatePost(activePost.id, applied);
      showToast("Saved!", "success");
    },
    onComment: (author, text) => {
      if (!activePost) return;
      store.addComment(activePost.id, author, text);
    },
    onDelete: (id) => {
      store.deletePost(id);
      showToast("Post deleted.", "");
    },
    onDuplicate: (id) => {
      store.duplicatePost(id);
      showToast("Post duplicated.", "success");
    },
    onUploadMedia: async (file) => {
      if (!activePost) return;
      await store.uploadPostMedia(activePost.id, file);
      showToast("Media uploaded.", "success");
    },
    onRemoveMedia: async (mediaId) => {
      if (!activePost) return;
      await store.removePostMedia(activePost.id, mediaId);
      showToast("Media removed.", "success");
    },
    onReorderMedia: async (orderedMediaIds) => {
      if (!activePost) return;
      await store.reorderPostMedia(activePost.id, orderedMediaIds);
    }
  });

  const scheduled = visiblePosts.filter((p) => p.scheduleDate).length;
  const selectedClient = getSelectedClient(state);
  const prefix = selectedClient ? `${selectedClient.name} • ` : "";
  el.stats.textContent = `${prefix}${visiblePosts.length}/${posts.length} posts • ${scheduled} scheduled`;
  refreshIcons();
}

// ── Auth guard ───────────────────────────────────────────────────────────────
const loginScreen = document.getElementById("login-screen");
const appEl = document.getElementById("app");

function showLogin() {
  loginScreen.hidden = false;
  appEl.style.display = "none";
}

function showApp() {
  loginScreen.hidden = true;
  appEl.style.display = "";
}

function initApp() {
  store.subscribe((state) => {
    lastState = state;
    paint(state);
  });
  window.addEventListener("hashchange", () => {
    void loadSharedCalendarFromHash();
  });
  void loadSharedCalendarFromHash();
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("l-error");
  const btn = document.getElementById("l-btn");
  errEl.hidden = true;
  btn.disabled = true;
  btn.textContent = "Signing in…";
  try {
    const email = document.getElementById("l-email").value.trim();
    const password = document.getElementById("l-pass").value;
    await login(email, password);
    showApp();
    initApp();
  } catch (err) {
    errEl.textContent = err.message || "Invalid credentials";
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Sign in";
  }
});

document.getElementById("sign-out").addEventListener("click", () => {
  setAuthToken(null);
  syncRoleActions();
  showLogin();
});

const isShareMode = location.hash.startsWith("#share=");
const isLocalPreviewHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const allowLocalPreviewBypass = isLocalPreviewHost && !isShareMode;

if (isShareMode || getAuthToken() || allowLocalPreviewBypass) {
  showApp();
  initApp();
} else {
  showLogin();
}

syncRoleActions();

async function loadSharedCalendarFromHash() {
  const token = getShareToken();
  if (!token) {
    shareState.token = "";
    shareState.loading = false;
    shareState.client = null;
    shareState.posts = [];
    shareState.error = "";
    paint(lastState);
    return;
  }
  if (shareState.token === token && (shareState.loading || shareState.client || shareState.error)) {
    paint(lastState);
    return;
  }

  shareState.token = token;
  shareState.loading = true;
  shareState.client = null;
  shareState.posts = [];
  shareState.error = "";
  paint(lastState);

  try {
    const data = await store.loadShareCalendar(token);
    shareState.client = data.client || null;
    shareState.posts = Array.isArray(data.posts) ? data.posts : [];
  } catch (error) {
    console.error(error);
    shareState.error = "Invalid share token";
  } finally {
    shareState.loading = false;
    paint(lastState);
  }
}

