import { createStore, sortByProfileOrder } from "./store.js";
import { renderCalendar, renderInspector, renderKanban, renderProfileSimulator, renderShareCalendar } from "./render.js";
import { getAuthToken, login, register, setAuthToken } from "./api.js";
import { loadJson, escapeHtml, getShareToken, toClientSharePosts, listAssignees, collectHashtagSuggestions } from "./utils.js";
import { sanitizeProfileSettingsPatch, resolveProfileSettingsForClient } from "./profile.js";
import { getMonthOffsetFromDate, getWeekOffsetFromDate, getNextScheduledEvent } from "./calendarUtils.js";
import { exportCsv, exportIcs } from "./export.js";

const store = createStore();
const STORAGE_UI_VIEWS = "soci.ui.views.v1";
const STORAGE_UI_SECTIONS = "soci.ui.sections.v1";
const STORAGE_THEME = "soci.theme.v1";

const el = {
  brandHome: document.querySelector("#brand-home"),
  viewToggles: [...document.querySelectorAll("[data-view]")],
  viewTitle: document.querySelector("#view-title"),
  stats: document.querySelector("#stats"),
  activeClient: document.querySelector("#active-client"),
  newClient: document.querySelector("#new-client"),
  deleteClient: document.querySelector("#delete-client"),
  manageUsers: document.querySelector("#manage-users"),
  copyShareLink: document.querySelector("#copy-share-link"),
  exportCsv: document.querySelector("#export-csv"),
  exportIcs: document.querySelector("#export-ics"),
  filterQuery: document.querySelector("#filter-query"),
  filterPlatform: document.querySelector("#filter-platform"),
  filterStatus: document.querySelector("#filter-status"),
  filterAssignee: document.querySelector("#filter-assignee"),
  adminUserPanel: document.querySelector("#admin-user-panel"),
  ownerConsolePanel: document.querySelector("#owner-console-panel"),
  ownerConsoleStats: document.querySelector("#owner-console-stats"),
  ownerUsersBody: document.querySelector("#owner-users-body"),
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
const OWNER_EMAILS = new Set(["zac@hommemade.xyz"]);

let profileMode = "instagram";
let inspectorPreviewPlatform = "instagram";
let simulatorSettingsOpen = false;
let showDraftLabels = true;
let calendarOffset = 0; // months from current
let calendarWeekOffset = 0; // weeks from current week
let calendarViewMode = "month";
let shareCalendarOffset = 0;
let lastState = { posts: [], media: [], activePostId: null, clients: [], activeClientId: "", isBootstrapped: false };
let visibleViews = loadJson(STORAGE_UI_VIEWS, { kanban: true, calendar: true, grid: false });
let collapsedSections = loadJson(STORAGE_UI_SECTIONS, { workflow: false, schedule: false, preview: false, adminUser: false, leftSidebar: false, rightSidebar: false, inspector: false });
const STORAGE_INSPECTOR_PINNED = "soci_inspector_pinned";
let inspectorPinned = localStorage.getItem(STORAGE_INSPECTOR_PINNED) === "true";
const STORAGE_INSPECTOR_WIDTH = "soci_inspector_width";
let inspectorFloatWidth = Math.min(Math.max(320, parseInt(localStorage.getItem(STORAGE_INSPECTOR_WIDTH) || "420", 10)), window.innerWidth - 32);
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

const ownerConsoleState = {
  loading: false,
  users: [],
  memberships: [],
  stats: null,
  loadedAt: 0,
  legacyEndpointWarned: false
};

let appUnsubscribe = null;
let hashListenerBound = false;

function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

function isOwnerConsoleUser() {
  const user = store.getCurrentUser?.() || null;
  const email = normalizeEmail(user?.email);
  if (!email) return false;
  if (OWNER_EMAILS.has(email)) return true;
  const authContext = store.getAuthContext?.() || {};
  return Boolean(authContext?.capabilities?.canUseOwnerConsole);
}

function canUseOwnerConsole() {
  return canManageUsers() && isOwnerConsoleUser();
}

function membershipCountByUserId() {
  return (ownerConsoleState.memberships || []).reduce((acc, membership) => {
    if (!membership?.userId) return acc;
    acc[membership.userId] = (acc[membership.userId] || 0) + 1;
    return acc;
  }, {});
}

function renderOwnerConsole() {
  if (!el.ownerConsolePanel || !el.ownerConsoleStats || !el.ownerUsersBody) return;
  const enabled = canUseOwnerConsole();
  el.ownerConsolePanel.classList.toggle("hidden", !enabled);
  if (!enabled) {
    el.ownerConsoleStats.innerHTML = "";
    el.ownerUsersBody.innerHTML = "";
    return;
  }

  const stats = ownerConsoleState.stats || {};
  const roleCounts = stats.roleCounts || {};
  el.ownerConsoleStats.innerHTML = `
    <div class="owner-stat"><span>Total</span><strong>${Number(stats.totalUsers || 0)}</strong></div>
    <div class="owner-stat"><span>Active</span><strong>${Number(stats.activeUsers || 0)}</strong></div>
    <div class="owner-stat"><span>Disabled</span><strong>${Number(stats.disabledUsers || 0)}</strong></div>
    <div class="owner-stat"><span>Admins</span><strong>${Number(roleCounts.owner_admin || 0) + Number(roleCounts.admin || 0)}</strong></div>
    <div class="owner-stat"><span>No Membership</span><strong>${Number(stats.usersWithoutMembership || 0)}</strong></div>
  `;

  const membershipCounts = membershipCountByUserId();
  const rows = (ownerConsoleState.users || []).map((user) => {
    const email = normalizeEmail(user.email);
    const isOwner = user.role === "owner_admin" || OWNER_EMAILS.has(email) || email === normalizeEmail(store.getCurrentUser?.()?.email);
    const disabled = Boolean(user.disabledAt);
    const status = disabled ? "Disabled" : "Active";
    const action = isOwner
      ? `<span class="subtle">Protected</span>`
      : disabled
      ? `<button class="small" data-owner-action="enable" data-user-id="${user.id}">Enable</button>`
      : `<button class="small" data-owner-action="disable" data-user-id="${user.id}">Disable</button>`;
    const resetBtn = isOwner
      ? ""
      : `<button class="small" data-owner-action="reset-password" data-user-id="${user.id}">Reset Password</button>`;
    const resendBtn = isOwner
      ? ""
      : `<button class="small" data-owner-action="resend-invite" data-user-id="${user.id}">Resend Invite</button>`;
    const deleteBtn = !isOwner && disabled
      ? `<button class="small btn-danger" data-owner-action="delete" data-user-id="${user.id}">Delete</button>`
      : "";
    return `
      <tr>
        <td><strong>${escapeHtml(user.name || "User")}</strong><br/><span class="subtle">${escapeHtml(user.email || "")}</span></td>
        <td>${escapeHtml(user.role || "client_user")}</td>
        <td>${status}</td>
        <td>${membershipCounts[user.id] || 0}</td>
        <td class="owner-actions">
          ${action}
          ${resetBtn}
          ${resendBtn}
          ${deleteBtn}
        </td>
      </tr>
    `;
  });
  el.ownerUsersBody.innerHTML = rows.join("") || `<tr><td colspan="5" class="subtle">No users found.</td></tr>`;
}

async function refreshOwnerConsole(force = false) {
  if (!canUseOwnerConsole()) {
    renderOwnerConsole();
    return;
  }
  if (!force && Date.now() - ownerConsoleState.loadedAt < 15000 && ownerConsoleState.users.length) {
    renderOwnerConsole();
    return;
  }

  ownerConsoleState.loading = true;
  try {
    const data = await store.adminGetUsers();
    ownerConsoleState.users = Array.isArray(data?.users) ? data.users : [];
    ownerConsoleState.memberships = Array.isArray(data?.memberships) ? data.memberships : [];
    ownerConsoleState.stats = data?.stats || null;
    if (data?.legacyEndpointMissing && !ownerConsoleState.legacyEndpointWarned) {
      ownerConsoleState.legacyEndpointWarned = true;
      showToast("Owner user endpoint missing on deployed API. Update backend to latest build.", "warning");
    }
    ownerConsoleState.loadedAt = Date.now();
  } catch {
    // centralized error handler already shows toast
  } finally {
    ownerConsoleState.loading = false;
    renderOwnerConsole();
  }
}

let themeMode = ["light", "dark"].includes(localStorage.getItem(STORAGE_THEME))
  ? localStorage.getItem(STORAGE_THEME)
  : "light";

store.setErrorHandler((message, error) => {
  if (error?.isAuthError) {
    setAuthToken(null);
    store.resetSession?.();
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

// ── Dialog system ─────────────────────────────────────────────────────────────
const _dlg = document.getElementById("soci-dialog");
function _dialogShow({ title, message, placeholder, okLabel = "OK", danger = false }) {
  return new Promise((resolve) => {
    const titleEl = _dlg.querySelector(".soci-dialog-title");
    const msgEl = _dlg.querySelector(".soci-dialog-msg");
    const inputEl = _dlg.querySelector(".soci-dialog-input");
    const okBtn = _dlg.querySelector(".soci-dialog-ok");
    const cancelBtn = _dlg.querySelector(".soci-dialog-cancel");

    const isPrompt = placeholder !== undefined;
    titleEl.textContent = title;
    okBtn.textContent = okLabel;
    okBtn.classList.toggle("danger", danger);
    msgEl.hidden = !message;
    if (message) msgEl.textContent = message;
    inputEl.hidden = !isPrompt;
    if (isPrompt) { inputEl.placeholder = placeholder; inputEl.value = ""; }

    let settled = false;
    function settle(value) {
      if (settled) return;
      settled = true;
      _dlg.close();
      resolve(value);
    }

    okBtn.onclick = () => settle(isPrompt ? (inputEl.value.trim() || null) : true);
    cancelBtn.onclick = () => settle(null);
    _dlg.oncancel = () => settle(null);
    if (isPrompt) inputEl.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); settle(inputEl.value.trim() || null); } };

    _dlg.showModal();
    if (isPrompt) requestAnimationFrame(() => inputEl.focus());
  });
}
function showPromptDialog(title, placeholder = "") {
  return _dialogShow({ title, placeholder });
}
function showConfirmDialog(title, message, { danger = false, okLabel = "Confirm" } = {}) {
  return _dialogShow({ title, message, danger, okLabel });
}

function resolveSimulatorClient(state) {
  const selectedClientId = filters.clientId || state.activeClientId || state.clients[0]?.id || "";
  const selectedClient = state.clients.find((client) => client.id === selectedClientId) || null;
  return {
    clientId: selectedClient?.id || "",
    clientName: selectedClient?.name || "All Workspaces"
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
  if (themeMode !== "light" && themeMode !== "dark") {
    themeMode = "light";
  }
  document.documentElement.setAttribute("data-theme", themeMode);
  if (el.themeToggle) {
    const nextTheme = themeMode === "dark" ? "light" : "dark";
    const icon = nextTheme === "light" ? "sun" : "moon";
    const label = nextTheme === "light" ? "Light Mode" : "Dark Mode";
    el.themeToggle.innerHTML = `<i data-lucide="${icon}" aria-hidden="true"></i><span>${label}</span>`;
    el.themeToggle.setAttribute("aria-label", `Switch to ${themeMode === "dark" ? "light" : "dark"} mode`);
    refreshIcons();
  }
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
function syncAssigneeFilter(posts) {
  const assignees = listAssignees(posts);
  const selected = filters.assignee;
  el.filterAssignee.innerHTML = `<option value="all">All Assignees</option>${assignees.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`;
  el.filterAssignee.value = assignees.includes(selected) ? selected : "all";
  filters.assignee = el.filterAssignee.value;
}

function syncClientFilter(clients, activeClientId) {
  const selected = filters.clientId || activeClientId || "";
  el.activeClient.innerHTML = `<option value="">All Workspaces</option>${clients.map((client) => `<option value="${client.id}">${escapeHtml(client.name)}</option>`).join("")}`;
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
    showToast("Assign a workspace before saving.", "error");
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
  document.body.classList.toggle("inspector-pinned", inspectorPinned);
  document.body.classList.toggle("right-collapsed", inspectorPinned && rightCollapsed);
  document.body.classList.toggle("both-collapsed", leftCollapsed && inspectorPinned && rightCollapsed);

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
  el.inspectorPanel.classList.toggle("is-collapsed", inspectorPinned && rightCollapsed);
  el.workflowSection.classList.toggle("is-collapsed", collapsedSections.workflow);
  el.scheduleSection.classList.toggle("is-collapsed", collapsedSections.schedule);
  el.previewSection.classList.toggle("is-collapsed", collapsedSections.preview);

  el.collapseLeftSidebar.textContent = leftCollapsed ? "Expand" : "Collapse";
  el.reopenLeftSidebar.classList.toggle("hidden", !leftCollapsed);
  el.reopenRightSidebar.classList.toggle("hidden", !(inspectorPinned && rightCollapsed));

  el.collapseWorkflow.textContent = collapsedSections.workflow ? "Expand" : "Collapse";
  el.collapseSchedule.textContent = collapsedSections.schedule ? "Expand" : "Collapse";
  el.collapsePreview.textContent = collapsedSections.preview ? "Expand" : "Collapse";

  for (const toggle of el.viewToggles) {
    toggle.classList.toggle("active", Boolean(visibleViews[toggle.dataset.view]));
  }

  applyInspectorWidth();
  syncKanbanOverflowState();
}

function applyInspectorWidth() {
  if (inspectorPinned) {
    el.inspectorPanel.style.width = "";
  } else {
    el.inspectorPanel.style.width = `${inspectorFloatWidth}px`;
  }
}

// ── Inspector resize drag ─────────────────────────────────────────────────────
{
  let isResizing = false;
  let resizeStartX = 0;
  let resizeStartWidth = 0;

  document.querySelector("#inspector-resize-handle").addEventListener("mousedown", (e) => {
    if (inspectorPinned) return;
    isResizing = true;
    resizeStartX = e.clientX;
    resizeStartWidth = el.inspectorPanel.getBoundingClientRect().width;
    document.body.style.userSelect = "none";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isResizing) return;
    const delta = resizeStartX - e.clientX;
    inspectorFloatWidth = Math.max(320, Math.min(window.innerWidth - 32, resizeStartWidth + delta));
    el.inspectorPanel.style.width = `${inspectorFloatWidth}px`;
  });

  document.addEventListener("mouseup", () => {
    if (!isResizing) return;
    isResizing = false;
    document.body.style.userSelect = "";
    localStorage.setItem(STORAGE_INSPECTOR_WIDTH, String(Math.round(inspectorFloatWidth)));
  });
}

function canManageUsers() {
  if (typeof store.canManageUsers === "function") return store.canManageUsers();
  const role = store.getCurrentUser()?.role || "";
  return ADMIN_ROLES.has(role);
}

function syncRoleActions() {
  const showOwnerConsole = canUseOwnerConsole();
  if (el.manageUsers) el.manageUsers.classList.toggle("hidden", !showOwnerConsole);
  if (!showOwnerConsole) {
    el.adminUserPanel?.classList.add("hidden");
  }
  renderOwnerConsole();
}

function syncActionPermissions(state) {
  const canCreatePosts = typeof store.canCreatePosts === "function" ? store.canCreatePosts() : true;
  const canManageClients = typeof store.canManageClients === "function" ? store.canManageClients() : true;
  const canCreateClients = typeof store.canCreateClients === "function" ? store.canCreateClients() : canManageClients;
  if (el.createBtn) {
    el.createBtn.disabled = !canCreatePosts;
    el.createBtn.title = canCreatePosts ? "" : "You do not have permission to create posts.";
  }
  if (el.newClient) {
    el.newClient.disabled = !canCreateClients;
    el.newClient.title = canCreateClients ? "" : "You do not have permission to create workspaces.";
  }
  if (el.deleteClient) {
    el.deleteClient.disabled = !canManageClients;
    el.deleteClient.title = canManageClients ? "" : "You do not have permission to delete workspaces.";
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
  el.adminMembershipClient.innerHTML = `<option value="">Select workspace...</option>${clients
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
  if (!canUseOwnerConsole()) {
    showToast("Owner-only console.", "warning");
    return;
  }
  el.adminUserPanel?.classList.remove("hidden");
  setAdminUserError("");
  applyUiState();
  void refreshOwnerConsole();
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
el.collapseRightSidebar.addEventListener("click", () => {
  if (!inspectorPinned) {
    store.setActivePost(null);
  } else {
    toggleCollapse("rightSidebar");
  }
});
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

document.querySelector("#toggle-pin-inspector").addEventListener("click", () => {
  inspectorPinned = !inspectorPinned;
  localStorage.setItem(STORAGE_INSPECTOR_PINNED, String(inspectorPinned));
  if (inspectorPinned) {
    document.body.classList.remove("inspector-active");
  } else {
    document.body.classList.toggle("inspector-active", Boolean(lastState.activePostId));
  }
  applyInspectorWidth();
  applyUiState();
});

el.createBtn.addEventListener("click", () => {
  if (typeof store.canCreatePosts === "function" && !store.canCreatePosts()) {
    showToast("You do not have permission to create posts.", "warning");
    return;
  }
  store.createPost();
});

el.newClient.addEventListener("click", async () => {
  if (typeof store.canCreateClients === "function" && !store.canCreateClients()) {
    showToast("You do not have permission to create workspaces.", "warning");
    return;
  }
  const name = await showPromptDialog("New Account", "e.g. Macy's Brand");
  if (!name) return;
  store.createClient(name);
  showToast("Account added.", "success");
});

el.deleteClient?.addEventListener("click", async () => {
  if (typeof store.canManageClients === "function" && !store.canManageClients()) {
    showToast("You do not have permission to delete workspaces.", "warning");
    return;
  }
  const client = getSelectedClient(lastState);
  if (!client) return showToast("Select a workspace first.", "warning");
  const ok = await showConfirmDialog(
    `Delete "${client.name}"?`,
    "This will permanently remove all posts and media. This cannot be undone.",
    { danger: true, okLabel: "Delete" }
  );
  if (!ok) return;
  store.deleteClient(client.id);
  filters.clientId = "";
  el.activeClient.value = "";
  showToast("Workspace deleted.", "success");
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
  if (!canUseOwnerConsole()) {
    setAdminUserError("Owner-only console.");
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
  const allowedRoles = isOwnerConsoleUser() ? ["helper_staff", "client_user", "admin"] : ["helper_staff", "client_user"];
  if (!allowedRoles.includes(role)) return setAdminUserError("Invalid role selection.");
  if (password.length < 8) return setAdminUserError("Password must be at least 8 characters.");
  if (assignMembership && !membershipClientId) return setAdminUserError("Select a workspace for membership assignment.");

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
  void refreshOwnerConsole(true);
});

el.ownerUsersBody?.addEventListener("click", async (event) => {
  const target = event.target.closest("button[data-owner-action]");
  if (!target || !canUseOwnerConsole()) return;
  const action = target.getAttribute("data-owner-action");
  const userId = target.getAttribute("data-user-id");
  if (!action || !userId) return;

  try {
    if (action === "disable") {
      await store.adminDisableUser(userId);
      showToast("User disabled.", "success");
    } else if (action === "enable") {
      await store.adminEnableUser(userId);
      showToast("User enabled.", "success");
    } else if (action === "reset-password") {
      const nextPassword = await showPromptDialog("Set new password", "Minimum 8 characters");
      if (!nextPassword) return;
      if (nextPassword.length < 8) {
        showToast("Password must be at least 8 characters.", "warning");
        return;
      }
      await store.adminResetUserPassword(userId, nextPassword);
      showToast("Password reset saved.", "success");
    } else if (action === "resend-invite") {
      const result = await store.adminResendUserInvite(userId);
      if (result?.emailSent) {
        showToast("Invite email resent.", "success");
      } else {
        showToast("Invite resend attempted, but email was not sent (check email config).", "warning");
      }
    } else if (action === "delete") {
      const ok = await showConfirmDialog(
        "Permanently delete user?",
        "This removes the user and memberships. This cannot be undone.",
        { danger: true, okLabel: "Delete Permanently" }
      );
      if (!ok) return;
      await store.adminDeleteUser(userId);
      showToast("User permanently deleted.", "success");
    }
    await refreshOwnerConsole(true);
  } catch {
    // centralized error handler handles toasts
  }
});

el.activeClient.addEventListener("change", () => {
  filters.clientId = el.activeClient.value;
  if (filters.clientId) store.setActiveClient(filters.clientId);
  paint(lastState);
});

el.copyShareLink.addEventListener("click", async () => {
  const client = getSelectedClient(lastState);
  if (!client) return showToast("Select a workspace first.", "warning");
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
  if (!client) return showToast("Select a workspace first.", "warning");
  exportCsv(client, toClientSharePosts(lastState, client.id));
  showToast("CSV exported.", "success");
});

el.exportIcs.addEventListener("click", () => {
  const client = getSelectedClient(lastState);
  if (!client) return showToast("Select a workspace first.", "warning");
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
  if (event.key === "Escape" && !inspectorPinned && lastState.activePostId) {
    store.setActivePost(null);
    return;
  }
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

document.addEventListener("click", (e) => {
  if (inspectorPinned) return;
  if (!lastState.activePostId) return;
  if (el.inspectorPanel.contains(e.target)) return;
  // Clicking a card/chip opens a (different) post — don't dismiss
  if (e.target.closest(".card, .chip")) return;
  store.setActivePost(null);
}, true);

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
          showToast("Select a workspace before editing preview settings.", "warning");
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
        showToast("Assign a workspace before moving status.", "error");
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
    viewMode: calendarViewMode,
    weekOffset: calendarWeekOffset,
    onViewModeChange: (mode) => {
      calendarViewMode = mode === "week" ? "week" : "month";
      paint(lastState);
    },
    onWeekOffsetChange: (delta) => {
      calendarWeekOffset += delta;
      paint(lastState);
    },
    nextEvent: getNextScheduledEvent(visiblePosts),
    onJumpToDate: (dateString) => {
      calendarOffset = getMonthOffsetFromDate(dateString);
      calendarWeekOffset = getWeekOffsetFromDate(dateString);
      paint(lastState);
    }
  });

  paintProfileSimulator();

  syncKanbanOverflowState();

  renderInspector(el.inspector, activePost, {
    clients: state.clients,
    media: state.media,
    hashtagSuggestions,
    previewPlatform: inspectorPreviewPlatform,
    onPreviewPlatformChange: (platform) => {
      inspectorPreviewPlatform = platform;
    },
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
    confirm: showConfirmDialog,
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

  document.body.classList.toggle("inspector-active", Boolean(state.activePostId) && !inspectorPinned);

  const scheduled = visiblePosts.filter((p) => p.scheduleDate).length;
  const selectedClient = getSelectedClient(state);
  const prefix = selectedClient ? `${selectedClient.name} • ` : "";
  el.stats.textContent = `${prefix}${visiblePosts.length}/${posts.length} posts • ${scheduled} scheduled`;
  refreshIcons();
}

// ── Auth guard ───────────────────────────────────────────────────────────────
const loginScreen = document.getElementById("login-screen");
const appEl = document.getElementById("app");
const loginForm = document.getElementById("login-form");
const loginModeToggle = document.getElementById("l-toggle-mode");
const loginNameWrap = document.getElementById("l-name-wrap");
const loginWorkspaceWrap = document.getElementById("l-workspace-wrap");
const loginNameInput = document.getElementById("l-name");
const loginWorkspaceInput = document.getElementById("l-workspace");
const loginEmailInput = document.getElementById("l-email");
const loginPasswordInput = document.getElementById("l-pass");
const loginErrorEl = document.getElementById("l-error");
const loginSubmitBtn = document.getElementById("l-btn");
let authMode = "login";

function applyAuthMode() {
  const isRegister = authMode === "register";
  loginNameWrap.hidden = !isRegister;
  loginWorkspaceWrap.hidden = !isRegister;
  loginNameInput.required = isRegister;
  loginWorkspaceInput.required = isRegister;
  loginPasswordInput.setAttribute("autocomplete", isRegister ? "new-password" : "current-password");
  loginSubmitBtn.textContent = isRegister ? "Create account" : "Sign in";
  loginModeToggle.textContent = isRegister ? "Back to sign in" : "Create account";
  loginErrorEl.hidden = true;
}

function showLogin() {
  loginScreen.hidden = false;
  appEl.style.display = "none";
}

function showApp() {
  loginScreen.hidden = true;
  appEl.style.display = "";
}

async function initApp({ refreshSession = false } = {}) {
  if (appUnsubscribe) {
    appUnsubscribe();
    appUnsubscribe = null;
  }
  if (refreshSession && typeof store.refreshSession === "function") {
    await store.refreshSession();
  }
  appUnsubscribe = store.subscribe((state) => {
    lastState = state;
    paint(state);
  });
  if (!hashListenerBound) {
    window.addEventListener("hashchange", () => {
      void loadSharedCalendarFromHash();
    });
    hashListenerBound = true;
  }
  await loadSharedCalendarFromHash();
}

loginModeToggle?.addEventListener("click", () => {
  authMode = authMode === "register" ? "login" : "register";
  applyAuthMode();
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginErrorEl.hidden = true;
  loginSubmitBtn.disabled = true;
  loginSubmitBtn.textContent = authMode === "register" ? "Creating account…" : "Signing in…";
  try {
    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value;
    if (authMode === "register") {
      await register({
        email,
        password,
        name: loginNameInput.value.trim(),
        workspaceName: loginWorkspaceInput.value.trim()
      });
    } else {
      await login(email, password);
    }
    showApp();
    await initApp({ refreshSession: true });
  } catch (err) {
    loginErrorEl.textContent = err.message || (authMode === "register" ? "Could not create account" : "Invalid credentials");
    loginErrorEl.hidden = false;
  } finally {
    loginSubmitBtn.disabled = false;
    loginSubmitBtn.textContent = authMode === "register" ? "Create account" : "Sign in";
  }
});

applyAuthMode();

document.getElementById("sign-out").addEventListener("click", () => {
  setAuthToken(null);
  store.resetSession?.();
  syncRoleActions();
  showLogin();
});

const isShareMode = location.hash.startsWith("#share=");
const isLocalPreviewHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const allowLocalPreviewBypass = isLocalPreviewHost && !isShareMode;

if (isShareMode || getAuthToken() || allowLocalPreviewBypass) {
  showApp();
  void initApp({ refreshSession: !isShareMode });
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

