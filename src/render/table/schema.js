import { STATUS_LABELS } from "../../data.js";
import { formatFriendlyDate } from "../shared.js";

export const TABLE_COLUMNS = [
  { key: "title", label: "Title", editable: true, editor: "text", sortable: true },
  { key: "clientId", label: "Workspace", editable: true, editor: "select", sortable: false },
  { key: "status", label: "Status", editable: true, editor: "select", sortable: true },
  { key: "platforms", label: "Platforms", editable: true, editor: "text", sortable: false },
  { key: "assignee", label: "Assignee", editable: true, editor: "text", sortable: true },
  { key: "scheduleDate", label: "Schedule", editable: true, editor: "date", sortable: true },
  { key: "caption", label: "Caption", editable: true, editor: "text", sortable: false },
  { key: "tags", label: "Tags", editable: true, editor: "text", sortable: false },
  { key: "visibility", label: "Visibility", editable: true, editor: "select", sortable: false },
  { key: "mediaCount", label: "Media", editable: false, editor: "readonly", sortable: false },
  { key: "readiness", label: "Readiness", editable: false, editor: "readonly", sortable: true },
  { key: "blockedText", label: "Blocked", editable: false, editor: "readonly", sortable: false },
  { key: "updatedAt", label: "Updated", editable: false, editor: "readonly", sortable: true }
];

export function getColumn(key) {
  return TABLE_COLUMNS.find((column) => column.key === key) || null;
}

export function getSelectOptions(column, context) {
  if (column.key === "status") {
    return Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }));
  }
  if (column.key === "clientId") {
    const clients = Array.isArray(context?.clients) ? context.clients : [];
    return clients.map((client) => ({ value: client.id, label: client.name }));
  }
  if (column.key === "visibility") {
    return [
      { value: "client-shareable", label: "Client Shareable" },
      { value: "internal", label: "Internal" }
    ];
  }
  return [];
}

export function formatCellValue(column, row, context) {
  const post = row?.post || {};
  if (column.key === "title") return post.title || "Untitled";
  if (column.key === "clientId") {
    const clientsById = context?.clientsById;
    return clientsById?.get(post.clientId)?.name || "—";
  }
  if (column.key === "status") return STATUS_LABELS[post.status] || post.status || "idea";
  if (column.key === "platforms") return Array.isArray(post.platforms) ? post.platforms.join(", ") : "—";
  if (column.key === "assignee") return post.assignee || "—";
  if (column.key === "scheduleDate") return formatFriendlyDate(post.scheduleDate || "");
  if (column.key === "caption") return post.caption || "—";
  if (column.key === "tags") return Array.isArray(post.tags) && post.tags.length ? post.tags.map((tag) => `#${tag}`).join(" ") : "—";
  if (column.key === "visibility") return post.visibility === "internal" ? "Internal" : "Client Shareable";
  if (column.key === "mediaCount") return String(row.mediaCount || 0);
  if (column.key === "readiness") return `${row.readiness || 0}%`;
  if (column.key === "blockedText") return row.blockedText || "Clear";
  if (column.key === "updatedAt") return formatFriendlyDate(String(post.updatedAt || "").slice(0, 10));
  return "";
}

export function getRawCellValue(column, row, context) {
  const post = row?.post || {};
  if (column.key === "title") return post.title || "";
  if (column.key === "clientId") {
    const clientsById = context?.clientsById;
    return clientsById?.get(post.clientId)?.name || post.clientId || "";
  }
  if (column.key === "status") return post.status || "idea";
  if (column.key === "platforms") return Array.isArray(post.platforms) ? post.platforms.join(", ") : "";
  if (column.key === "assignee") return post.assignee || "";
  if (column.key === "scheduleDate") return post.scheduleDate || "";
  if (column.key === "caption") return post.caption || "";
  if (column.key === "tags") return Array.isArray(post.tags) ? post.tags.map((tag) => `#${tag}`).join(" ") : "";
  if (column.key === "visibility") return post.visibility || "client-shareable";
  if (column.key === "mediaCount") return String(row.mediaCount || 0);
  if (column.key === "readiness") return String(row.readiness || 0);
  if (column.key === "blockedText") return row.blockedText || "";
  if (column.key === "updatedAt") return String(post.updatedAt || "").slice(0, 10);
  return "";
}

export function parseEditValue(column, raw, context) {
  const value = String(raw ?? "").trim();
  if (column.key === "title") return value || "Untitled Post";
  if (column.key === "clientId") {
    const clients = Array.isArray(context?.clients) ? context.clients : [];
    const byId = clients.find((client) => client.id === value);
    if (byId) return byId.id;
    const byName = clients.find((client) => String(client.name || "").toLowerCase() === value.toLowerCase());
    if (byName) return byName.id;

    const lowered = value.toLowerCase();
    const prefixMatches = clients.filter((client) => String(client.name || "").toLowerCase().startsWith(lowered));
    if (prefixMatches.length === 1) return prefixMatches[0].id;

    const containsMatches = clients.filter((client) => String(client.name || "").toLowerCase().includes(lowered));
    if (containsMatches.length === 1) return containsMatches[0].id;

    return context?.row?.post?.clientId || "";
  }
  if (column.key === "status") {
    const normalize = (input) => String(input || "").toLowerCase().replace(/[^a-z]/g, "");
    const aliases = {
      draft: "idea",
      idea: "idea",
      inprogress: "in-progress",
      progress: "in-progress",
      inreview: "in-review",
      review: "in-review",
      ready: "ready"
    };
    const allowed = new Set(Object.keys(STATUS_LABELS));
    const normalizedValue = normalize(value);
    const direct = Object.entries(STATUS_LABELS).find(([key, label]) => {
      return normalize(key) === normalizedValue || normalize(label) === normalizedValue;
    });
    if (direct?.[0]) return direct[0];

    if (aliases[normalizedValue]) return aliases[normalizedValue];

    const partial = Object.entries(STATUS_LABELS).filter(([key, label]) => {
      return normalize(key).startsWith(normalizedValue) || normalize(label).startsWith(normalizedValue);
    });
    if (partial.length === 1 && allowed.has(partial[0][0])) return partial[0][0];

    return context?.row?.post?.status || "idea";
  }
  if (column.key === "platforms") {
    return value
      .split(/[,|]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (column.key === "assignee") return value;
  if (column.key === "scheduleDate") return value;
  if (column.key === "caption") return value;
  if (column.key === "tags") {
    return value
      .split(/[ ,|]+/)
      .map((item) => item.trim().replace(/^#/, ""))
      .filter(Boolean);
  }
  if (column.key === "visibility") {
    const normalized = value.toLowerCase().replace(/[^a-z]/g, "");
    return normalized === "internal" ? "internal" : "client-shareable";
  }
  return value;
}
