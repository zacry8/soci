import { createStore, sortByProfileOrder } from "./store.js";
import { renderCalendar, renderInspector, renderKanban, renderProfileSimulator, renderShareCalendar, renderTable } from "./render.js";
import { getAuthToken, login, register, setAuthToken } from "./api.js";
import { loadJson, escapeHtml, getShareToken, toClientSharePosts, listAssignees, collectHashtagSuggestions } from "./utils.js";
import { sanitizeProfileSettingsPatch, resolveProfileSettingsForClient } from "./profile.js";
import { getMonthOffsetFromDate, getWeekOffsetFromDate, getNextScheduledEvent } from "./calendarUtils.js";
import { exportCsv, exportIcs } from "./export.js";
import { sortedPosts } from "./render/table/metrics.js";

const store = createStore();
const STORAGE_UI_VIEWS = "soci.ui.views.v1";
const STORAGE_UI_SECTIONS = "soci.ui.sections.v1";
const STORAGE_THEME = "soci.theme.v1";
const STORAGE_KANBAN_VIEW_OPTIONS = "soci.kanban.view-options.v1";
const STORAGE_PREVIEW_VIEW_OPTIONS = "soci.preview.view-options.v1";
const STORAGE_PINNED_CLIENT = "soci.workspace.pinned.v1";
const STORAGE_LAST_ACTIVE_CLIENT = "soci.workspace.last-active.v1";
const TABLE_PASTE_HEADERS = {
  title: "title",
  post: "title",
  workspace: "workspace",
  client: "workspace",
  clientname: "workspace",
  status: "status",
  platforms: "platforms",
  platform: "platforms",
  assignee: "assignee",
  scheduledate: "scheduleDate",
  schedule: "scheduleDate",
  caption: "caption",
  tags: "tags",
  visibility: "visibility"
};
const TABLE_PASTE_POSITIONAL = ["title", "workspace", "status", "platforms", "assignee", "scheduleDate", "caption", "tags", "visibility"];

const el = {
  brandHome: document.querySelector("#brand-home"),
  viewToggles: [...document.querySelectorAll("[data-view]")],
  viewTitle: document.querySelector("#view-title"),
  stats: document.querySelector("#stats"),
  activeClient: document.querySelector("#active-client"),
  pinWorkspace: document.querySelector("#pin-workspace"),
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
  tableSection: document.querySelector("#table-section"),
  previewSection: document.querySelector("#preview-section"),
  collapseWorkflow: document.querySelector("#collapse-workflow"),
  kanbanOverflowHint: document.querySelector("#kanban-overflow-hint"),
  collapseSchedule: document.querySelector("#collapse-schedule"),
  collapseTable: document.querySelector("#collapse-table"),
  tableCopyRows: document.querySelector("#table-copy-rows"),
  tablePasteRows: document.querySelector("#table-paste-rows"),
  collapsePreview: document.querySelector("#collapse-preview"),
  inspectorPanel: document.querySelector("#inspector-panel"),
  collapseRightSidebar: document.querySelector("#collapse-right-sidebar"),
  reopenRightSidebar: document.querySelector("#reopen-right-sidebar"),
  kanban: document.querySelector("#kanban-view"),
  calendar: document.querySelector("#calendar-view"),
  table: document.querySelector("#table-view"),
  grid: document.querySelector("#grid-view"),
  inspector: document.querySelector("#inspector"),
  tablePasteDialog: document.querySelector("#table-paste-dialog"),
  tablePasteInput: document.querySelector("#table-paste-input"),
  tablePasteResult: document.querySelector("#table-paste-result"),
  tablePasteSubmit: document.querySelector("#table-paste-submit"),
  tablePasteCancel: document.querySelector("#table-paste-cancel"),
  commandPalette: document.querySelector("#command-palette"),
  commandPaletteInput: document.querySelector("#command-palette-input"),
  commandPaletteResults: document.querySelector("#command-palette-results"),
  createBtn: document.querySelector("#create-post"),
  toast: document.querySelector("#toast"),
  themeToggle: document.querySelector("#theme-toggle"),
  optKanbanThumb: document.querySelector("#opt-kanban-thumb"),
  optKanbanMeta: document.querySelector("#opt-kanban-meta"),
  optKanbanExcerpt: document.querySelector("#opt-kanban-excerpt"),
  optPreviewThumb: document.querySelector("#opt-preview-thumb"),
  optPreviewMeta: document.querySelector("#opt-preview-meta"),
  optPreviewDescription: document.querySelector("#opt-preview-description"),
  optPreviewTextOnly: document.querySelector("#opt-preview-text-only")
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
let visibleViews = loadJson(STORAGE_UI_VIEWS, { kanban: true, calendar: true, table: false, grid: false });
let collapsedSections = loadJson(STORAGE_UI_SECTIONS, { workflow: false, schedule: false, table: false, preview: false, adminUser: false, leftSidebar: false, rightSidebar: false, inspector: false });
let kanbanViewOptions = loadJson(STORAGE_KANBAN_VIEW_OPTIONS, { showThumbnail: true, showMeta: true, showExcerpt: true });
let previewViewOptions = loadJson(STORAGE_PREVIEW_VIEW_OPTIONS, { showThumbnail: true, showMeta: true, showDescription: true, textOnly: false });
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
if (typeof collapsedSections.table !== "boolean") {
  collapsedSections.table = false;
}
const filters = {
  clientId: "",
  query: "",
  platform: "all",
  status: "all",
  assignee: "all"
};
let tableSort = { key: "scheduleDate", direction: "asc" };
let pinnedClientId = localStorage.getItem(STORAGE_PINNED_CLIENT) || "";
let lastActiveClientId = localStorage.getItem(STORAGE_LAST_ACTIVE_CLIENT) || "";
let commandPaletteOpen = false;
let commandPaletteSelection = 0;
let commandPaletteItems = [];
let workspacePreferenceApplied = false;

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
      ? `<button class="small owner-icon-btn" data-owner-action="enable" data-user-id="${user.id}" title="Enable user" aria-label="Enable user"><i data-lucide="user-check" aria-hidden="true"></i></button>`
      : `<button class="small owner-icon-btn" data-owner-action="disable" data-user-id="${user.id}" title="Disable user" aria-label="Disable user"><i data-lucide="user-x" aria-hidden="true"></i></button>`;
    const resetBtn = isOwner
      ? ""
      : `<button class="small owner-icon-btn" data-owner-action="reset-password" data-user-id="${user.id}" title="Reset password" aria-label="Reset password"><i data-lucide="key" aria-hidden="true"></i></button>`;
    const resendBtn = isOwner
      ? ""
      : `<button class="small owner-icon-btn" data-owner-action="resend-invite" data-user-id="${user.id}" title="Resend invite" aria-label="Resend invite"><i data-lucide="mail" aria-hidden="true"></i></button>`;
    const deleteBtn = !isOwner && disabled
      ? `<button class="small btn-danger owner-icon-btn" data-owner-action="delete" data-user-id="${user.id}" title="Delete user" aria-label="Delete user"><i data-lucide="trash-2" aria-hidden="true"></i></button>`
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
  refreshIcons();
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
    const label = themeMode === "dark" ? "Dark Mode" : "Light Mode";
    const labelEl = el.themeToggle.querySelector(".theme-switch-label");
    if (labelEl) labelEl.textContent = label;
    el.themeToggle.setAttribute("aria-pressed", String(themeMode === "dark"));
    el.themeToggle.setAttribute("aria-label", `Switch to ${themeMode === "dark" ? "light" : "dark"} mode`);
  }
}

function syncViewOptionsControls() {
  if (el.optKanbanThumb) el.optKanbanThumb.checked = kanbanViewOptions.showThumbnail !== false;
  if (el.optKanbanMeta) el.optKanbanMeta.checked = kanbanViewOptions.showMeta !== false;
  if (el.optKanbanExcerpt) el.optKanbanExcerpt.checked = kanbanViewOptions.showExcerpt !== false;
  if (el.optPreviewThumb) el.optPreviewThumb.checked = previewViewOptions.showThumbnail !== false;
  if (el.optPreviewMeta) el.optPreviewMeta.checked = previewViewOptions.showMeta !== false;
  if (el.optPreviewDescription) el.optPreviewDescription.checked = previewViewOptions.showDescription !== false;
  if (el.optPreviewTextOnly) el.optPreviewTextOnly.checked = previewViewOptions.textOnly === true;
}

function persistViewOptions() {
  localStorage.setItem(STORAGE_KANBAN_VIEW_OPTIONS, JSON.stringify(kanbanViewOptions));
  localStorage.setItem(STORAGE_PREVIEW_VIEW_OPTIONS, JSON.stringify(previewViewOptions));
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
[
  el.optKanbanThumb,
  el.optKanbanMeta,
  el.optKanbanExcerpt,
  el.optPreviewThumb,
  el.optPreviewMeta,
  el.optPreviewDescription,
  el.optPreviewTextOnly
].forEach((checkbox) => {
  checkbox?.addEventListener("change", () => {
    kanbanViewOptions = {
      showThumbnail: el.optKanbanThumb?.checked !== false,
      showMeta: el.optKanbanMeta?.checked !== false,
      showExcerpt: el.optKanbanExcerpt?.checked !== false
    };
    previewViewOptions = {
      showThumbnail: el.optPreviewThumb?.checked !== false,
      showMeta: el.optPreviewMeta?.checked !== false,
      showDescription: el.optPreviewDescription?.checked !== false,
      textOnly: el.optPreviewTextOnly?.checked === true
    };
    persistViewOptions();
    paint(lastState);
  });
});
applyTheme();
syncViewOptionsControls();

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
  syncPinnedWorkspaceUI(clients);
}

function resolvePreferredClientId(clients = [], activeClientId = "") {
  const validIds = new Set((clients || []).map((client) => client.id));
  if (pinnedClientId && validIds.has(pinnedClientId)) return pinnedClientId;
  if (lastActiveClientId && validIds.has(lastActiveClientId)) return lastActiveClientId;
  if (activeClientId && validIds.has(activeClientId)) return activeClientId;
  return "";
}

function syncPinnedWorkspaceUI(clients = []) {
  if (!el.pinWorkspace) return;
  const isValidPin = Boolean(pinnedClientId) && clients.some((client) => client.id === pinnedClientId);
  if (!isValidPin && pinnedClientId) {
    pinnedClientId = "";
    localStorage.removeItem(STORAGE_PINNED_CLIENT);
  }
  const activeId = filters.clientId || lastState.activeClientId || "";
  const isPinned = Boolean(activeId) && activeId === pinnedClientId;
  el.pinWorkspace.classList.toggle("is-pinned", isPinned);
  el.pinWorkspace.setAttribute("aria-pressed", String(isPinned));
  el.pinWorkspace.title = isPinned ? "Unpin workspace default" : "Pin current workspace as default";
  const label = el.pinWorkspace.querySelector("span");
  if (label) label.textContent = isPinned ? "Pinned" : "Pin Workspace";
}

function setPinnedWorkspace(clientId = "") {
  const nextId = String(clientId || "").trim();
  if (!nextId) {
    pinnedClientId = "";
    localStorage.removeItem(STORAGE_PINNED_CLIENT);
    syncPinnedWorkspaceUI(lastState.clients || []);
    return;
  }
  pinnedClientId = nextId;
  localStorage.setItem(STORAGE_PINNED_CLIENT, pinnedClientId);
  syncPinnedWorkspaceUI(lastState.clients || []);
}

function recordLastActiveWorkspace(clientId = "") {
  const nextId = String(clientId || "").trim();
  lastActiveClientId = nextId;
  if (!nextId) {
    localStorage.removeItem(STORAGE_LAST_ACTIVE_CLIENT);
  } else {
    localStorage.setItem(STORAGE_LAST_ACTIVE_CLIENT, nextId);
  }
}

function normalizeUrlList(raw = "") {
  return String(raw || "")
    .split(/[\n,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => /^https:\/\//i.test(value));
}

async function quickAddPostStub({ title = "", status = "idea", scheduleDate = "" } = {}) {
  if (typeof store.canCreatePosts === "function" && !store.canCreatePosts()) {
    showToast("You do not have permission to create posts.", "warning");
    return null;
  }
  const preferredClientId = filters.clientId || lastState.activeClientId || lastState.clients[0]?.id || "";
  if (!preferredClientId) {
    showToast("Create or select a workspace first.", "warning");
    return null;
  }
  const finalTitle = String(title || "").trim() || "Untitled Post";
  try {
    return await store.createPostStub({
      title: finalTitle,
      status,
      scheduleDate,
      clientId: preferredClientId,
      platforms: ["Instagram"]
    });
  } catch (error) {
    showToast(error?.message || "Could not create post.", "error");
    return null;
  }
}

async function runMediaDump(dataTransfer) {
  if (!dataTransfer) return;
  const files = Array.from(dataTransfer.files || []);
  const rawText = dataTransfer.getData("text/plain") || "";
  const urls = normalizeUrlList(rawText);
  if (!files.length && !urls.length) return;

  const createdPosts = [];
  const failed = [];

  for (const file of files) {
    const post = await quickAddPostStub({ title: file.name.replace(/\.[^.]+$/, "") || "Media Draft", status: "idea" });
    if (!post?.id) {
      failed.push(`Could not create draft for ${file.name}`);
      continue;
    }
    try {
      await store.uploadPostMedia(post.id, file);
      createdPosts.push(post.id);
    } catch (error) {
      failed.push(`${file.name}: ${error?.message || "upload failed"}`);
    }
  }

  for (const url of urls) {
    const post = await quickAddPostStub({ title: "BYOS Draft", status: "idea" });
    if (!post?.id) {
      failed.push(`Could not create draft for link ${url.slice(0, 36)}...`);
      continue;
    }
    try {
      await store.attachExternalMedia(post.id, { externalUrl: url, provider: "", displayName: "BYOS Link" });
      createdPosts.push(post.id);
    } catch (error) {
      failed.push(`${url.slice(0, 36)}...: ${error?.message || "attach failed"}`);
    }
  }

  const summary = `Media dump: ${createdPosts.length} drafted${failed.length ? ` • ${failed.length} failed` : ""}`;
  showToast(summary, failed.length ? "warning" : "success");
}

function bindMediaDumpZones() {
  const zones = [el.scheduleSection, el.tableSection].filter(Boolean);
  for (const zone of zones) {
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      zone.classList.add("media-dump-active");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("media-dump-active"));
    zone.addEventListener("drop", async (event) => {
      event.preventDefault();
      zone.classList.remove("media-dump-active");
      await runMediaDump(event.dataTransfer);
    });
  }
}

function getCommandItems() {
  const workspaceItems = (lastState.clients || []).map((client) => ({
    id: `workspace:${client.id}`,
    label: `Switch workspace: ${client.name}`,
    run: () => {
      filters.clientId = client.id;
      store.setActiveClient(client.id);
      recordLastActiveWorkspace(client.id);
      closeCommandPalette();
    }
  }));
  return [
    ...workspaceItems,
    {
      id: "new-post",
      label: "Create new post",
      run: () => {
        store.createPost();
        closeCommandPalette();
      }
    },
    {
      id: "toggle-theme",
      label: "Toggle light/dark mode",
      run: () => {
        toggleTheme();
        closeCommandPalette();
      }
    },
    {
      id: "show-calendar",
      label: "Focus Calendar view",
      run: () => {
        revealView("calendar", "schedule");
        closeCommandPalette();
      }
    },
    {
      id: "show-rows",
      label: "Focus Rows table",
      run: () => {
        revealView("table", "table");
        closeCommandPalette();
      }
    }
  ];
}

function renderCommandPalette(query = "") {
  if (!el.commandPaletteResults) return;
  const normalized = String(query || "").trim().toLowerCase();
  const all = getCommandItems();
  commandPaletteItems = all.filter((item) => {
    if (!normalized) return true;
    return item.label.toLowerCase().includes(normalized);
  }).slice(0, 8);
  commandPaletteSelection = Math.min(commandPaletteSelection, Math.max(commandPaletteItems.length - 1, 0));
  if (!commandPaletteItems.length) {
    el.commandPaletteResults.innerHTML = `<div class="command-empty">No commands found.</div>`;
    return;
  }
  el.commandPaletteResults.innerHTML = commandPaletteItems
    .map((item, index) => `<button type="button" class="command-item ${index === commandPaletteSelection ? "active" : ""}" data-command-index="${index}">${escapeHtml(item.label)}</button>`)
    .join("");
}

function openCommandPalette() {
  if (!el.commandPalette || commandPaletteOpen) return;
  commandPaletteOpen = true;
  commandPaletteSelection = 0;
  el.commandPalette.showModal();
  if (el.commandPaletteInput) {
    el.commandPaletteInput.value = "";
    renderCommandPalette("");
    requestAnimationFrame(() => el.commandPaletteInput?.focus());
  }
}

function closeCommandPalette() {
  if (!commandPaletteOpen || !el.commandPalette) return;
  commandPaletteOpen = false;
  el.commandPalette.close();
}

function executeCommandPaletteSelection() {
  const selected = commandPaletteItems[commandPaletteSelection];
  if (!selected) return;
  selected.run();
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

function normalizeTableUpdatePatch(existingPost, patch) {
  if (!existingPost || !patch || typeof patch !== "object") return null;
  const merged = { ...existingPost, ...patch };
  const applied = applyStatusRules(merged, existingPost);
  if (!applied) return null;
  const editableKeys = ["title", "clientId", "status", "platforms", "assignee", "scheduleDate", "caption", "tags", "visibility"];
  const nextPatch = {};
  for (const key of editableKeys) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      nextPatch[key] = applied[key];
    }
  }
  return Object.keys(nextPatch).length ? nextPatch : null;
}

function buildSheetsTsv(posts, clients) {
  const header = ["title", "workspace", "status", "platforms", "assignee", "scheduleDate", "caption", "tags", "visibility"];
  const clientNames = new Map((clients || []).map((client) => [client.id, client.name || ""]));
  const lines = [header.join("\t")];

  for (const post of posts) {
    const values = [
      post.title || "",
      clientNames.get(post.clientId) || "",
      post.status || "idea",
      Array.isArray(post.platforms) ? post.platforms.join(", ") : "",
      post.assignee || "",
      post.scheduleDate || "",
      post.caption || "",
      Array.isArray(post.tags) ? post.tags.map((tag) => `#${tag}`).join(" ") : "",
      post.visibility || "client-shareable"
    ].map((value) => String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " "));
    lines.push(values.join("\t"));
  }

  return lines.join("\n");
}

async function writeClipboardText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "readonly");
  helper.style.position = "fixed";
  helper.style.opacity = "0";
  helper.style.pointerEvents = "none";
  document.body.append(helper);
  helper.focus();
  helper.select();
  const copied = document.execCommand("copy");
  helper.remove();
  if (!copied) {
    throw new Error("Clipboard unavailable");
  }
}

const PLATFORM_HANDOFF_URLS = {
  instagram: "https://www.instagram.com/",
  tiktok: "https://www.tiktok.com/upload?lang=en",
  facebook: "https://business.facebook.com/latest/composer",
  linkedin: "https://www.linkedin.com/post/new/",
  x: "https://x.com/compose/post",
  twitter: "https://x.com/compose/post"
};

function getPlatformHandoffUrl(platform = "") {
  const normalized = String(platform || "").trim().toLowerCase().replace(/\s+/g, "");
  return PLATFORM_HANDOFF_URLS[normalized] || "https://www.instagram.com/";
}

function pickPreferredMediaLink(mediaItems = []) {
  if (!Array.isArray(mediaItems) || !mediaItems.length) return "";
  const external = mediaItems.find((item) => item?.storageMode === "external" && (item.externalUrl || item.urlPath));
  if (external) return String(external.externalUrl || external.urlPath || "").trim();
  const uploaded = mediaItems.find((item) => item?.urlPath);
  return String(uploaded?.urlPath || "").trim();
}

async function copyRowsForSheets() {
  const visiblePosts = sortByProfileOrder(lastState.posts).filter(matchesFilters);
  const rows = sortedPosts(visiblePosts, tableSort);
  if (!rows.length) {
    showToast("No visible rows to copy.", "warning");
    return;
  }

  await writeClipboardText(buildSheetsTsv(rows, lastState.clients));
  showToast(`Copied ${rows.length} row${rows.length === 1 ? "" : "s"} for Sheets.`, "success");
}

function parsePastedRows(raw) {
  const normalized = String(raw || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return { rows: [], skipped: [] };
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return { rows: [], skipped: [] };

  const splitLine = (line) => {
    if (line.includes("\t")) return line.split("\t").map((v) => v.trim());
    return line.split(",").map((v) => v.trim());
  };

  const first = splitLine(lines[0]).map((value) => value.toLowerCase().replace(/[^a-z]/g, ""));
  const recognizedHeaderCount = first.filter((value) => TABLE_PASTE_HEADERS[value]).length;
  const hasHeader = recognizedHeaderCount >= 2;
  const mapping = hasHeader
    ? splitLine(lines[0]).map((value) => TABLE_PASTE_HEADERS[value.toLowerCase().replace(/[^a-z]/g, "")] || "")
    : TABLE_PASTE_POSITIONAL;

  const dataLines = hasHeader ? lines.slice(1) : lines;
  const rows = [];
  const skipped = [];

  dataLines.forEach((line, index) => {
    const values = splitLine(line);
    if (!values.some(Boolean)) return;
    const row = { rowNumber: hasHeader ? index + 2 : index + 1 };
    values.forEach((value, colIndex) => {
      const key = mapping[colIndex] || "";
      if (!key || !value) return;
      row[key] = value;
    });
    if (!String(row.title || "").trim() && !String(row.caption || "").trim()) {
      skipped.push({ rowNumber: row.rowNumber, reason: "Missing title/caption content." });
      return;
    }
    rows.push(row);
  });

  return { rows, skipped };
}

function normalizeScheduleDate(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function normalizeImportedRows(rows, clients, activeClientId) {
  const normalizedClients = Array.isArray(clients) ? clients : [];
  const byName = new Map(normalizedClients.map((client) => [String(client.name || "").trim().toLowerCase(), client.id]));
  const allowedStatuses = new Set(["idea", "in-progress", "in-review", "ready"]);
  const statusAliases = {
    draft: "idea",
    inprogress: "in-progress",
    inreview: "in-review"
  };
  const result = [];
  const skipped = [];

  rows.forEach((row) => {
    const workspaceRaw = String(row.workspace || "").trim();
    const statusRaw = String(row.status || "idea").trim().toLowerCase();
    const statusCanonical = statusAliases[statusRaw.replace(/[^a-z]/g, "")] || statusRaw;
    if (statusCanonical && !allowedStatuses.has(statusCanonical)) {
      skipped.push({ rowNumber: row.rowNumber, reason: `Invalid status: ${row.status}` });
      return;
    }

    let clientId = "";
    if (workspaceRaw) {
      clientId = byName.get(workspaceRaw.toLowerCase()) || "";
      if (!clientId && normalizedClients.some((client) => client.id === workspaceRaw)) {
        clientId = workspaceRaw;
      }
      if (!clientId) {
        skipped.push({ rowNumber: row.rowNumber, reason: `Workspace not found: ${workspaceRaw}` });
        return;
      }
    } else {
      clientId = activeClientId || normalizedClients[0]?.id || "";
    }

    const platforms = String(row.platforms || "Instagram")
      .split(/[,|]/)
      .map((value) => value.trim())
      .filter(Boolean);
    const tags = String(row.tags || "")
      .split(/[ ,|]+/)
      .map((value) => value.trim().replace(/^#/, ""))
      .filter(Boolean);
    const visibility = String(row.visibility || "client-shareable").trim() === "internal" ? "internal" : "client-shareable";

    result.push({
      rowNumber: row.rowNumber,
      title: String(row.title || row.caption || "Untitled Post").trim(),
      clientId,
      status: statusCanonical || "idea",
      platforms: platforms.length ? platforms : ["Instagram"],
      assignee: String(row.assignee || "").trim(),
      scheduleDate: normalizeScheduleDate(row.scheduleDate || ""),
      caption: String(row.caption || "").trim(),
      tags,
      visibility
    });
  });

  return { rows: result, skipped };
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
  el.tableSection.classList.toggle("hidden", !visibleViews.table);
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
  el.tableSection.classList.toggle("is-collapsed", collapsedSections.table);
  el.previewSection.classList.toggle("is-collapsed", collapsedSections.preview);

  el.collapseLeftSidebar.textContent = leftCollapsed ? "Expand" : "Collapse";
  el.reopenLeftSidebar.classList.toggle("hidden", !leftCollapsed);
  el.reopenRightSidebar.classList.toggle("hidden", !(inspectorPinned && rightCollapsed));

  el.collapseWorkflow.textContent = collapsedSections.workflow ? "Expand" : "Collapse";
  el.collapseSchedule.textContent = collapsedSections.schedule ? "Expand" : "Collapse";
  el.collapseTable.textContent = collapsedSections.table ? "Expand" : "Collapse";
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
  if (el.tablePasteRows) {
    el.tablePasteRows.disabled = !canCreatePosts;
    el.tablePasteRows.title = canCreatePosts ? "" : "You do not have permission to create posts.";
  }
  if (el.tableCopyRows) {
    const hasVisibleRows = Array.isArray(state?.posts) && state.posts.some(matchesFilters);
    el.tableCopyRows.disabled = !hasVisibleRows;
    el.tableCopyRows.title = hasVisibleRows ? "Copy visible rows with headers for Google Sheets." : "No visible rows to copy.";
  }

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
el.collapseTable.addEventListener("click", () => toggleCollapse("table"));
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

el.tableCopyRows?.addEventListener("click", async () => {
  try {
    await copyRowsForSheets();
  } catch (error) {
    console.error(error);
    showToast("Could not copy rows. Try again.", "error");
  }
});

el.tablePasteRows?.addEventListener("click", () => {
  if (typeof store.canCreatePosts === "function" && !store.canCreatePosts()) {
    showToast("You do not have permission to create posts.", "warning");
    return;
  }
  if (!el.tablePasteDialog) return;
  if (el.tablePasteInput) el.tablePasteInput.value = "";
  if (el.tablePasteResult) el.tablePasteResult.textContent = "Paste rows from Sheets/Airtable, then click Import Rows.";
  el.tablePasteDialog.showModal();
  requestAnimationFrame(() => el.tablePasteInput?.focus());
});

el.tablePasteCancel?.addEventListener("click", () => {
  el.tablePasteDialog?.close();
});

el.tablePasteSubmit?.addEventListener("click", async () => {
  const raw = el.tablePasteInput?.value || "";
  const parsed = parsePastedRows(raw);
  const normalized = normalizeImportedRows(parsed.rows, lastState.clients, lastState.activeClientId);
  const allSkipped = [...parsed.skipped, ...normalized.skipped];
  if (!normalized.rows.length) {
    if (el.tablePasteResult) {
      el.tablePasteResult.textContent = allSkipped.length
        ? `No importable rows. ${allSkipped.slice(0, 3).map((item) => `Row ${item.rowNumber}: ${item.reason}`).join(" | ")}`
        : "No data detected.";
    }
    return;
  }

  el.tablePasteSubmit.disabled = true;
  const originalLabel = el.tablePasteSubmit.textContent;
  el.tablePasteSubmit.textContent = "Importing...";
  try {
    const imported = await store.bulkCreatePosts(normalized.rows);
    const failed = [...allSkipped, ...(imported?.failed || [])];
    const summary = `Created ${imported?.created || 0} row(s)${failed.length ? ` • Skipped ${failed.length}` : ""}`;
    if (el.tablePasteResult) {
      const details = failed.slice(0, 3).map((item) => `Row ${item.rowNumber}: ${item.reason}`).join(" | ");
      el.tablePasteResult.textContent = details ? `${summary} • ${details}` : summary;
    }
    showToast(summary, failed.length ? "warning" : "success");
    if ((imported?.created || 0) > 0) {
      paint(lastState);
      setTimeout(() => el.tablePasteDialog?.close(), 250);
    }
  } finally {
    el.tablePasteSubmit.disabled = false;
    el.tablePasteSubmit.textContent = originalLabel;
  }
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
    table: false,
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
  if (target.disabled || target.classList.contains("is-busy")) return;
  const action = target.getAttribute("data-owner-action");
  const userId = target.getAttribute("data-user-id");
  if (!action || !userId) return;

  const row = target.closest("tr");
  const rowButtons = row
    ? [...row.querySelectorAll("button[data-owner-action]")]
    : [target];
  for (const button of rowButtons) {
    button.disabled = true;
  }
  target.classList.add("is-busy");

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
  } finally {
    target.classList.remove("is-busy");
    for (const button of rowButtons) {
      button.disabled = false;
    }
  }
});

el.activeClient.addEventListener("change", () => {
  filters.clientId = el.activeClient.value;
  if (filters.clientId) {
    store.setActiveClient(filters.clientId);
    recordLastActiveWorkspace(filters.clientId);
  }
  workspacePreferenceApplied = true;
  syncPinnedWorkspaceUI(lastState.clients || []);
  paint(lastState);
});

el.pinWorkspace?.addEventListener("click", () => {
  const activeId = filters.clientId || lastState.activeClientId || "";
  if (!activeId) {
    showToast("Select a workspace first.", "warning");
    return;
  }
  if (pinnedClientId === activeId) {
    setPinnedWorkspace("");
    showToast("Workspace unpinned.", "");
  } else {
    setPinnedWorkspace(activeId);
    showToast("Workspace pinned as default.", "success");
  }
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
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (commandPaletteOpen) closeCommandPalette();
    else openCommandPalette();
    return;
  }
  if (commandPaletteOpen) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeCommandPalette();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      commandPaletteSelection = Math.min(commandPaletteSelection + 1, Math.max(commandPaletteItems.length - 1, 0));
      renderCommandPalette(el.commandPaletteInput?.value || "");
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      commandPaletteSelection = Math.max(commandPaletteSelection - 1, 0);
      renderCommandPalette(el.commandPaletteInput?.value || "");
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      executeCommandPaletteSelection();
      return;
    }
  }
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

el.commandPaletteInput?.addEventListener("input", () => {
  commandPaletteSelection = 0;
  renderCommandPalette(el.commandPaletteInput?.value || "");
});
el.commandPaletteResults?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-command-index]");
  if (!button) return;
  const index = Number(button.getAttribute("data-command-index"));
  if (!Number.isFinite(index)) return;
  commandPaletteSelection = index;
  executeCommandPaletteSelection();
});
el.commandPalette?.addEventListener("close", () => {
  commandPaletteOpen = false;
});

bindMediaDumpZones();

document.addEventListener("click", (e) => {
  if (inspectorPinned) return;
  if (!lastState.activePostId) return;
  if (el.inspectorPanel.contains(e.target)) return;
  // Clicking a card/chip opens a (different) post — don't dismiss
  if (e.target.closest(".card, .chip, .row-open")) return;
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
    el.tableSection.classList.add("hidden");
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
    el.table.innerHTML = "";
    el.grid.innerHTML = "";
    el.inspector.innerHTML = "<div class='empty'>Loading…</div>";
    return;
  }

  applyUiState();
  syncMembershipControls();
  if (!workspacePreferenceApplied) {
    const preferredClientId = resolvePreferredClientId(state.clients, state.activeClientId);
    workspacePreferenceApplied = true;
    if (preferredClientId && preferredClientId !== state.activeClientId) {
      filters.clientId = preferredClientId;
      store.setActiveClient(preferredClientId);
      recordLastActiveWorkspace(preferredClientId);
      return;
    }
  }
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
      displayOptions: previewViewOptions,
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
    },
    {
      ...kanbanViewOptions,
      media: state.media,
      onQuickAdd: async (status) => {
        const title = await showPromptDialog("Quick add post", "Title");
        if (!title) return;
        const created = await quickAddPostStub({ title, status: status || "idea" });
        if (created?.id) {
          showToast("Draft added.", "success");
          store.setActivePost(created.id);
        }
      }
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
    },
    onCreateFromEmptyDate: async (dateString) => {
      const created = await quickAddPostStub({ title: "Untitled Post", scheduleDate: dateString, status: "idea" });
      if (created?.id) {
        store.setActivePost(created.id);
        showToast("Draft created for selected date.", "success");
      }
    },
    onDropPostToDate: async (postId, dateString) => {
      const post = state.posts.find((item) => item.id === postId);
      if (!post) return;
      if (!store.canEditPost(post)) {
        showToast("You do not have permission to schedule this post.", "warning");
        return;
      }
      const scheduledAt = `${dateString}T09:00:00.000Z`;
      store.updatePost(postId, {
        scheduleDate: dateString,
        publishState: "scheduled",
        scheduledAt,
        status: post.status === "idea" ? "in-progress" : post.status
      });
      showToast("Post scheduled by drag & drop.", "success");
    }
  });

  renderTable(el.table, visiblePosts, {
    clients: state.clients,
    activeClientId: state.activeClientId,
    sort: tableSort,
    onOpen: (id) => {
      store.setActivePost(id);
      revealView("table", "table");
    },
    onCellUpdate: (rowId, patch) => {
      const targetPost = state.posts.find((post) => post.id === rowId);
      if (!targetPost) return;
      if (!store.canEditPost(targetPost)) {
        showToast("You do not have permission to edit this row.", "warning");
        return;
      }
      const safePatch = normalizeTableUpdatePatch(targetPost, patch);
      if (!safePatch) return;
      store.updatePost(rowId, safePatch);
    },
    onBatchCellUpdate: (updates = []) => {
      if (!Array.isArray(updates) || !updates.length) return;
      let appliedCount = 0;
      let deniedCount = 0;
      for (const update of updates) {
        const rowId = update?.rowId;
        if (!rowId) continue;
        const targetPost = state.posts.find((post) => post.id === rowId);
        if (!targetPost) continue;
        if (!store.canEditPost(targetPost)) {
          deniedCount += 1;
          continue;
        }
        const safePatch = normalizeTableUpdatePatch(targetPost, update.patch || {});
        if (!safePatch) continue;
        store.updatePost(rowId, safePatch);
        appliedCount += 1;
      }
      if (appliedCount) {
        showToast(`Updated ${appliedCount} cell ${appliedCount === 1 ? "value" : "values"}.`, "success");
      } else if (deniedCount) {
        showToast(`Skipped ${deniedCount} ${deniedCount === 1 ? "row" : "rows"} due to edit permissions.`, "warning");
      }
    },
    onBatchCreateRows: async (rowsToCreate = []) => {
      if (!Array.isArray(rowsToCreate) || !rowsToCreate.length) return;
      if (typeof store.canCreatePosts === "function" && !store.canCreatePosts()) {
        showToast("You do not have permission to create posts.", "warning");
        return;
      }
      const imported = await store.bulkCreatePosts(rowsToCreate);
      const failed = Array.isArray(imported?.failed) ? imported.failed : [];
      const created = Number(imported?.created || 0);
      if (!created && !failed.length) return;
      const summary = `Created ${created} row${created === 1 ? "" : "s"}${failed.length ? ` • Skipped ${failed.length}` : ""}`;
      showToast(summary, failed.length ? "warning" : "success");
    },
    onSortChange: (nextSort) => {
      tableSort = nextSort;
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
      canAttachExternalMedia: Boolean(state?.authContext?.capabilities?.canUploadMedia) && (activePost ? store.canEditPost(activePost) : false),
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
    onAttachExternalMedia: async (payload) => {
      if (!activePost) return;
      await store.attachExternalMedia(activePost.id, payload);
      showToast("Cloud media link attached.", "success");
    },
    onCopyMediaLink: async (mediaId) => {
      const mediaItem = state.media.find((item) => item.id === mediaId);
      const link = String(mediaItem?.externalUrl || mediaItem?.urlPath || "").trim();
      if (!link) throw new Error("Media link unavailable");
      await writeClipboardText(link);
      showToast("Media link copied.", "success");
    },
    onRemoveMedia: async (mediaId) => {
      if (!activePost) return;
      await store.removePostMedia(activePost.id, mediaId);
      showToast("Media removed.", "success");
    },
    onHandoffPublish: async ({ platform, caption, media }) => {
      if (!activePost) return;
      const handoffUrl = getPlatformHandoffUrl(platform);
      const captionText = String(caption || "").trim() || String(activePost.caption || "").trim();
      const mediaLink = pickPreferredMediaLink(media);

      if (captionText) {
        await writeClipboardText(captionText);
        showToast("Caption copied to clipboard.", "success");
      } else {
        showToast("No caption found to copy.", "warning");
      }

      window.open(handoffUrl, "_blank", "noopener,noreferrer");
      if (mediaLink) {
        window.open(mediaLink, "_blank", "noopener,noreferrer");
        showToast("Opened platform + media source. Paste caption to finish posting.", "");
      } else {
        showToast("Opened platform uploader. Paste caption and choose media.", "");
      }

      const didPublish = await showConfirmDialog(
        "Did this post successfully publish?",
        "Click Yes after you finish posting on the platform.",
        { okLabel: "Yes, mark published" }
      );
      if (didPublish) {
        store.updatePost(activePost.id, {
          publishState: "published",
          publishedAt: new Date().toISOString()
        });
        showToast("Post marked as published.", "success");
      } else {
        showToast("Post state unchanged.", "warning");
      }
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
