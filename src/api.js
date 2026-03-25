const STORAGE_AUTH_TOKEN = "soci.auth.token";
const STORAGE_API_BASE = "soci.api.base";

function getApiBase() {
  return localStorage.getItem(STORAGE_API_BASE) || "http://localhost:8787";
}

function setApiBase(base) {
  localStorage.setItem(STORAGE_API_BASE, base.replace(/\/$/, ""));
}

export function getAuthToken() {
  return localStorage.getItem(STORAGE_AUTH_TOKEN) || "";
}

export function setAuthToken(token) {
  if (!token) localStorage.removeItem(STORAGE_AUTH_TOKEN);
  else localStorage.setItem(STORAGE_AUTH_TOKEN, token);
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
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function login(email, password) {
  const data = await request("/api/auth/login", { method: "POST", body: { email, password } });
  setAuthToken(data.token || "");
  return data;
}

export async function ensureAdminToken() {
  let token = getAuthToken();
  if (token) return token;

  const base = prompt("API base URL", getApiBase())?.trim();
  if (base) setApiBase(base);
  const email = prompt("Admin email", "admin@soci.local")?.trim();
  const password = prompt("Admin password", "") || "";
  if (!email || !password) throw new Error("Admin login cancelled");

  const auth = await login(email, password);
  token = auth.token || "";
  if (!token) throw new Error("No auth token returned");
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

export async function createShareLink(token, clientId) {
  return request("/api/admin/share-links", { method: "POST", token, body: { clientId } });
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
