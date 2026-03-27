const STORAGE_AUTH_TOKEN = "soci.auth.token";
const STORAGE_AUTH_USER = "soci.auth.user";
const STORAGE_API_BASE = "soci.api.base";

function normalizeApiBase(base) {
  if (!base) return "";
  let next = String(base).trim();
  next = next.replace(/\/+$/, "");
  // Handle legacy saved values like "https://api.domain.com/api"
  if (next.endsWith("/api")) next = next.slice(0, -4);
  return next;
}

function getApiBase() {
  const stored = localStorage.getItem(STORAGE_API_BASE);
  if (stored) return normalizeApiBase(stored);
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return "http://localhost:8787";
  return normalizeApiBase(`https://api.${host}`);
}

export function resolveApiUrl(urlPath = "") {
  const value = String(urlPath || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  const base = getApiBase();
  if (!base) return value;
  if (value.startsWith("/")) return `${base}${value}`;
  return `${base}/${value}`;
}


export function getAuthToken() {
  return localStorage.getItem(STORAGE_AUTH_TOKEN) || "";
}

export function setAuthToken(token) {
  if (!token) {
    localStorage.removeItem(STORAGE_AUTH_TOKEN);
    localStorage.removeItem(STORAGE_AUTH_USER);
  } else {
    localStorage.setItem(STORAGE_AUTH_TOKEN, token);
  }
}

export function getAuthUser() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_AUTH_USER) || "null");
  } catch {
    return null;
  }
}

async function request(path, { method = "GET", token = "", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${getApiBase()}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    const err = new Error(data.error || "Unauthorized");
    err.isAuthError = true;
    throw err;
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function login(email, password) {
  const data = await request("/api/auth/login", { method: "POST", body: { email, password } });
  setAuthToken(data.token || "");
  if (data.user && typeof data.user === "object") {
    localStorage.setItem(STORAGE_AUTH_USER, JSON.stringify(data.user));
  } else {
    localStorage.removeItem(STORAGE_AUTH_USER);
  }
  return data;
}

export async function ensureAdminToken() {
  const token = getAuthToken();
  if (!token) throw new Error("Not authenticated");
  return token;
}

export async function getAdminState(token) {
  return request("/api/admin/state", { token });
}

export async function upsertClient(token, payload) {
  return request("/api/admin/clients", { method: "POST", token, body: payload });
}

export async function upsertPost(token, payload) {
  return request("/api/admin/posts", { method: "POST", token, body: payload });
}

export async function deletePost(token, id) {
  return request(`/api/admin/posts/${id}`, { method: "DELETE", token });
}

export async function deletePostMedia(token, postId, mediaId) {
  return request(`/api/admin/posts/${postId}/media/${mediaId}`, { method: "DELETE", token });
}

export async function reorderPostMedia(token, postId, mediaIds) {
  return request(`/api/admin/posts/${postId}/media/reorder`, {
    method: "POST",
    token,
    body: { mediaIds }
  });
}

export async function deleteClient(token, id) {
  return request(`/api/admin/clients/${id}`, { method: "DELETE", token });
}

export async function createShareLink(token, clientId) {
  return request("/api/admin/share-links", { method: "POST", token, body: { clientId } });
}

export async function createUser(token, payload) {
  return request("/api/admin/users", { method: "POST", token, body: payload });
}

export async function assignMembership(token, payload) {
  return request("/api/admin/memberships", { method: "POST", token, body: payload });
}

export async function getMyState(token) {
  return request("/api/me/state", { token });
}

export async function upsertMyPost(token, payload) {
  return request("/api/me/posts", { method: "POST", token, body: payload });
}

export async function deleteMyPostMedia(token, postId, mediaId) {
  return request(`/api/me/posts/${postId}/media/${mediaId}`, { method: "DELETE", token });
}

export async function reorderMyPostMedia(token, postId, mediaIds) {
  return request(`/api/me/posts/${postId}/media/reorder`, {
    method: "POST",
    token,
    body: { mediaIds }
  });
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const str = String(reader.result || "");
      resolve(str.includes(",") ? str.split(",")[1] : str);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function uploadMedia(token, { postId, file }) {
  const contentBase64 = await toBase64(file);
  return request("/api/admin/media", {
    method: "POST",
    token,
    body: {
      postId,
      fileName: file.name,
      mimeType: file.type,
      contentBase64
    }
  });
}

export async function getShareCalendar(token) {
  return request("/api/share/calendar", { token });
}
