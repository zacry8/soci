/**
 * Role matrix integration tests — Soci
 * Verifies that API permission boundaries are enforced at the HTTP layer.
 *
 * Fixture: backend/data/permission-smoke-db.json (read-only — never mutated by these tests)
 * Runner:  node --test backend/tests/role-matrix.test.mjs
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// ── Test server config ────────────────────────────────────────────────────────
const TEST_PORT = 8788;
const BASE = `http://localhost:${TEST_PORT}`;
const AUTH_SECRET = "test-secret-for-integration-tests-do-not-use-in-prod";

// ── Smoke fixture IDs (from permission-smoke-db.json) ────────────────────────
const SMOKE_CLIENT_ID = "eecace4d-fa37-418d-b184-bd4b73a7099c";
const OWNER_USER_ID   = "owner-admin";
const HELPER_USER_ID  = "b36e2daf-8521-4e25-a44a-dbcd9de771ba";
const CLIENT_USER_ID  = "9a17c2c1-ba14-4353-a3e2-0949596412f3";
const INTERNAL_POST_ID = "5560cf8f-43d4-40ff-912c-90ca685f48ff"; // visibility: "internal"

// ── Token minting (mirrors backend/auth.js createAuthToken) ──────────────────
function mintToken(claims) {
  const body = { ...claims, exp: Math.floor(Date.now() / 1000) + 3600 };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = crypto.createHmac("sha256", AUTH_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

const ownerToken  = mintToken({ role: "owner_admin",  userId: OWNER_USER_ID,  email: "owner@test.local" });
const helperToken = mintToken({ role: "helper_staff", userId: HELPER_USER_ID, email: "helper@test.local" });
const clientToken = mintToken({ role: "client_user",  userId: CLIENT_USER_ID, email: "client@test.local" });

// ── HTTP helpers ──────────────────────────────────────────────────────────────
async function api(pathname, token, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${BASE}${pathname}`, { ...opts, headers });
}

async function post(pathname, token, body) {
  return api(pathname, token, { method: "POST", body: JSON.stringify(body) });
}

// ── Server lifecycle ──────────────────────────────────────────────────────────
let server;

before(async () => {
  const env = {
    ...process.env,
    PORT: String(TEST_PORT),
    AUTH_SECRET,
    ADMIN_EMAIL: "admin@test.local",
    ADMIN_PASSWORD: "test-admin-password-integration",
    DATA_FILE: path.join(ROOT, "backend", "data", "permission-smoke-db.json"),
    UPLOAD_DIR: path.join(ROOT, "backend", "uploads-smoke"),
    EMAIL_ENABLED: "false",
    CORS_ORIGINS: BASE,
    APP_BASE_URL: BASE,
    API_BASE_URL: BASE,
  };

  server = spawn("node", ["backend/server.js"], { cwd: ROOT, env, stdio: "pipe" });

  server.stderr.on("data", (d) => {
    const line = d.toString().trim();
    if (line) process.stderr.write(`[server] ${line}\n`);
  });

  // Wait for /health to respond
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Server did not start within 10s")), 10_000);
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`${BASE}/health`);
        if (res.ok) { clearInterval(poll); clearTimeout(timeout); resolve(); }
      } catch { /* not ready */ }
    }, 100);
  });
});

after(() => { server?.kill(); });

// ── Tests ─────────────────────────────────────────────────────────────────────

test("unauthenticated request to /api/me/state returns 401", async () => {
  const res = await api("/api/me/state", null);
  assert.equal(res.status, 401);
});

test("unauthenticated request to /api/admin/state returns 401", async () => {
  const res = await api("/api/admin/state", null);
  assert.equal(res.status, 401);
});

// Owner
test("owner can access /api/admin/state", async () => {
  const res = await api("/api/admin/state", ownerToken);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.clients), "should return clients array");
  assert.ok(Array.isArray(body.posts), "should return posts array");
  assert.ok(Array.isArray(body.users), "should return users array");
});

test("owner /api/admin/state returns ALL posts including internal", async () => {
  const res = await api("/api/admin/state", ownerToken);
  const { posts } = await res.json();
  const internalPost = posts.find((p) => p.id === INTERNAL_POST_ID);
  assert.ok(internalPost, "owner must see internal posts");
});

// Helper
test("helper is blocked from /api/admin/state with 401", async () => {
  const res = await api("/api/admin/state", helperToken);
  assert.equal(res.status, 401);
});

test("helper can access /api/me/state", async () => {
  const res = await api("/api/me/state", helperToken);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.posts), "should return posts");
});

test("helper /api/me/state only returns assigned client workspaces", async () => {
  const res = await api("/api/me/state", helperToken);
  const { clients } = await res.json();
  for (const client of clients) {
    assert.equal(client.id, SMOKE_CLIENT_ID, `unexpected client in helper response: ${client.id}`);
  }
});

test("helper /api/me/state sees internal posts (helper_staff is not client_user)", async () => {
  const res = await api("/api/me/state", helperToken);
  const { posts } = await res.json();
  const internalPost = posts.find((p) => p.id === INTERNAL_POST_ID);
  assert.ok(internalPost, "helper_staff should see internal posts");
});

test("helper with edit permission can create a post via /api/me/posts", async () => {
  const res = await post("/api/me/posts", helperToken, {
    clientId: SMOKE_CLIENT_ID,
    title: "Integration Test Post",
    caption: "",
    tags: [],
    platforms: ["Instagram"],
    status: "idea",
    visibility: "client-shareable",
    scheduleDate: "",
    mediaIds: [],
    publishState: "draft",
    postType: "photo",
    platformVariants: {},
    checklist: { copy: false, media: false, tags: false, schedule: false, approval: false }
  });
  // Helper has view+comment+edit on smoke client → canCreatePosts = true
  assert.equal(res.status, 200);
});

// Client user
test("client_user is blocked from /api/admin/state with 401", async () => {
  const res = await api("/api/admin/state", clientToken);
  assert.equal(res.status, 401);
});

test("client_user can access /api/me/state", async () => {
  const res = await api("/api/me/state", clientToken);
  assert.equal(res.status, 200);
});

test("client_user /api/me/state does NOT include internal posts", async () => {
  const res = await api("/api/me/state", clientToken);
  const { posts } = await res.json();
  const internalPost = posts.find((p) => p.id === INTERNAL_POST_ID);
  assert.equal(internalPost, undefined, "client_user must not see internal posts");
});

test("client_user cannot create posts via /api/me/posts (view+comment only)", async () => {
  const res = await post("/api/me/posts", clientToken, {
    clientId: SMOKE_CLIENT_ID,
    title: "Should Fail",
    caption: "",
    tags: [],
    platforms: ["Instagram"],
    status: "idea",
    visibility: "client-shareable",
    scheduleDate: "",
    mediaIds: [],
    publishState: "draft",
    postType: "photo",
    platformVariants: {},
    checklist: { copy: false, media: false, tags: false, schedule: false, approval: false }
  });
  assert.equal(res.status, 403);
});

test("client_user cannot comment on internal post", async () => {
  const res = await post(`/api/me/posts/${INTERNAL_POST_ID}/comments`, clientToken, {
    text: "Should not be allowed"
  });
  // client_user cannot access internal posts at all → 403
  assert.equal(res.status, 403);
});

test("client_user cannot mutate posts in a client they have no membership for", async () => {
  const res = await post("/api/me/posts", clientToken, {
    clientId: "00000000-0000-0000-0000-000000000000", // non-existent client
    title: "Cross-workspace attack",
    caption: "",
    tags: [],
    platforms: [],
    status: "idea",
    visibility: "client-shareable",
    scheduleDate: "",
    mediaIds: [],
    publishState: "draft",
    postType: "photo",
    platformVariants: {},
    checklist: { copy: false, media: false, tags: false, schedule: false, approval: false }
  });
  assert.equal(res.status, 403);
});
