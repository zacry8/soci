import { createStore, profileIntegrity, sortByProfileOrder } from "./store.js";
import { renderCalendar, renderInspector, renderKanban, renderProfileSimulator, renderShareCalendar } from "./render.js";

const store = createStore();
const STORAGE_UI_VIEWS = "soci.ui.views.v1";
const STORAGE_UI_SECTIONS = "soci.ui.sections.v1";

const el = {
  viewToggles: [...document.querySelectorAll("[data-view]")],
  viewTitle: document.querySelector("#view-title"),
  stats: document.querySelector("#stats"),
  activeClient: document.querySelector("#active-client"),
  newClient: document.querySelector("#new-client"),
  copyShareLink: document.querySelector("#copy-share-link"),
  exportCsv: document.querySelector("#export-csv"),
  exportIcs: document.querySelector("#export-ics"),
  filterQuery: document.querySelector("#filter-query"),
  filterPlatform: document.querySelector("#filter-platform"),
  filterStatus: document.querySelector("#filter-status"),
  filterAssignee: document.querySelector("#filter-assignee"),
  leftSidebar: document.querySelector("#left-sidebar"),
  collapseLeftSidebar: document.querySelector("#collapse-left-sidebar"),
  reopenLeftSidebar: document.querySelector("#reopen-left-sidebar"),
  workflowSection: document.querySelector("#workflow-section"),
  scheduleSection: document.querySelector("#schedule-section"),
  previewSection: document.querySelector("#preview-section"),
  collapseWorkflow: document.querySelector("#collapse-workflow"),
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
  toast: document.querySelector("#toast")
};

let profileMode = "instagram";
let calendarOffset = 0; // months from current
let shareCalendarOffset = 0;
let lastState = { posts: [], media: [], activePostId: null, clients: [], activeClientId: "", isBootstrapped: false };
let visibleViews = loadJson(STORAGE_UI_VIEWS, { kanban: true, calendar: true, grid: false });
let collapsedSections = loadJson(STORAGE_UI_SECTIONS, { workflow: false, schedule: false, preview: false, leftSidebar: false, rightSidebar: false, inspector: false });
if (typeof collapsedSections.rightSidebar !== "boolean") {
  collapsedSections.rightSidebar = Boolean(collapsedSections.inspector);
}
if (typeof collapsedSections.leftSidebar !== "boolean") {
  collapsedSections.leftSidebar = false;
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

function persistUiState() {
  localStorage.setItem(STORAGE_UI_VIEWS, JSON.stringify(visibleViews));
  localStorage.setItem(STORAGE_UI_SECTIONS, JSON.stringify(collapsedSections));
}

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
    return existing;
  }
  if ((next.status === "in-review" || next.status === "ready") && !next.scheduleDate) {
    showToast("Schedule date is required for In Review / Ready.", "error");
    next.status = existing.status;
  }
  if (next.status === "ready" && !next.checklist.approval) {
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

el.createBtn.addEventListener("click", () => store.createPost());

el.newClient.addEventListener("click", () => {
  const name = prompt("Client name:");
  if (!name?.trim()) return;
  store.createClient(name.trim());
  showToast("Client added.", "success");
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
  const posts = sortByProfileOrder(state.posts);
  syncClientFilter(state.clients, state.activeClientId);
  syncAssigneeFilter(posts);
  el.viewTitle.textContent = "Planning Workspace";

  const visiblePosts = posts.filter(matchesFilters);
  const activePost = posts.find((p) => p.id === state.activePostId) || null;
  const integrity = profileIntegrity(posts);

  const paintProfileSimulator = () => {
    renderProfileSimulator(el.grid, visiblePosts, {
      mode: profileMode,
      integrity,
      onModeChange: (nextMode) => {
        profileMode = nextMode;
        paintProfileSimulator();
      },
      onFixPost: (id) => {
        store.setActivePost(id);
        revealView("kanban", "workflow");
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
  });

  paintProfileSimulator();

  renderInspector(el.inspector, activePost, {
    clients: state.clients,
    media: state.media,
    onSave: (patch) => {
      if (!activePost) return;
      store.updatePost(activePost.id, applyStatusRules(patch, activePost));
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
    }
  });

  const scheduled = visiblePosts.filter((p) => p.scheduleDate).length;
  const selectedClient = getSelectedClient(state);
  const prefix = selectedClient ? `${selectedClient.name} • ` : "";
  el.stats.textContent = `${prefix}${visiblePosts.length}/${posts.length} posts • ${scheduled} scheduled`;
}

store.subscribe((state) => {
  lastState = state;
  paint(state);
});

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

window.addEventListener("hashchange", () => {
  void loadSharedCalendarFromHash();
});

void loadSharedCalendarFromHash();
