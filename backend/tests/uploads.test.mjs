/**
 * Upload access enforcement integration tests — Soci
 * Verifies that GET /uploads/:filename enforces auth and workspace scoping.
 *
 * Fixture: backend/data/upload-smoke-db.json
 *          backend/uploads-smoke/test-media-upload.png (1x1 dummy PNG)
 * Runner:  node --test backend/tests/uploads.test.mjs
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const TEST_PORT = 8789;
const BASE = `http://localhost:${TEST_PORT}`;
const AUTH_SECRET = "test-secret-for-upload-tests-do-not-use-in-prod";

// Fixture IDs (from upload-smoke-db.json)
const OWNER_USER_ID  = "owner-admin";
const HELPER_USER_ID = "b36e2daf-8521-4e25-a44a-dbcd9de771ba";
const CLIENT_USER_ID = "9a17c2c1-ba14-4353-a3e2-0949596412f3";
const TEST_FILE      = "test-media-upload.png"; // shared by both posts in fixture

function mintToken(claims) {
  const body = { ...claims, exp: Math.floor(Date.now() / 1000) + 3600 };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = crypto.createHmac("sha256", AUTH_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

const ownerToken  = mintToken({ role: "owner_admin",  userId: OWNER_USER_ID,  email: "owner@test.local" });
const helperToken = mintToken({ role: "helper_staff", userId: HELPER_USER_ID, email: "helper@test.local" });
const clientToken = mintToken({ role: "client_user",  userId: CLIENT_USER_ID, email: "client@test.local" });
// Outsider: valid token but for a user not in the DB
const outsiderToken = mintToken({ role: "helper_staff", userId: "00000000-0000-0000-0000-000000000000", email: "outsider@test.local" });

async function get(pathname, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${BASE}${pathname}`, { headers });
}

let server;

before(async () => {
  const env = {
    ...process.env,
    PORT: String(TEST_PORT),
    AUTH_SECRET,
    ADMIN_EMAIL: "admin@test.local",
    ADMIN_PASSWORD: "test-admin-password-upload",
    DATA_FILE: path.join(ROOT, "backend", "data", "upload-smoke-db.json"),
    UPLOAD_DIR: path.join(ROOT, "backend", "uploads-smoke"),
    EMAIL_ENABLED: "false",
    CORS_ORIGINS: BASE,
    APP_BASE_URL: BASE,
    API_BASE_URL: BASE,
  };

  server = spawn("node", ["backend/server.js"], { cwd: ROOT, env, stdio: "pipe" });

  server.stderr.on("data", (d) => {
    const line = d.toString().trim();
    if (line) process.stderr.write(`[upload-server] ${line}\n`);
  });

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

// ── Auth boundary ─────────────────────────────────────────────────────────────

test("unauthenticated request to /uploads/:file returns 401", async () => {
  const res = await get(`/uploads/${TEST_FILE}`, null);
  assert.equal(res.status, 401);
});

test("malformed token returns 401", async () => {
  const res = await get(`/uploads/${TEST_FILE}`, "not-a-valid-token");
  assert.equal(res.status, 401);
});

test("token signed with wrong secret returns 401", async () => {
  // Mint with a different secret
  const body = { role: "owner_admin", userId: OWNER_USER_ID, exp: Math.floor(Date.now() / 1000) + 3600 };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  const badSig = crypto.createHmac("sha256", "wrong-secret").update(encoded).digest("base64url");
  const badToken = `${encoded}.${badSig}`;
  const res = await get(`/uploads/${TEST_FILE}`, badToken);
  assert.equal(res.status, 401);
});

test("non-existent file with valid auth returns 404", async () => {
  const res = await get("/uploads/does-not-exist.png", ownerToken);
  assert.equal(res.status, 404);
});

// ── Owner access ──────────────────────────────────────────────────────────────

test("owner can retrieve a file attached to a client-shareable post", async () => {
  const res = await get(`/uploads/${TEST_FILE}`, ownerToken);
  assert.equal(res.status, 200);
  assert.ok(res.headers.get("content-type")?.startsWith("image/png"));
});

// ── Helper access ─────────────────────────────────────────────────────────────

test("helper can retrieve file from their assigned workspace (client-shareable post)", async () => {
  const res = await get(`/uploads/${TEST_FILE}`, helperToken);
  assert.equal(res.status, 200);
});

test("outsider (valid token, not in DB) cannot retrieve files", async () => {
  const res = await get(`/uploads/${TEST_FILE}`, outsiderToken);
  // User not found in DB → 401
  assert.equal(res.status, 401);
});

// ── Client user access ────────────────────────────────────────────────────────

test("client_user can retrieve file from a client-shareable post in their workspace", async () => {
  // The fixture has both media records pointing to the same file.
  // The uploads route looks up by filename — it finds the FIRST match.
  // post-shareable-001 is client-shareable → client should get 200.
  // Note: since both posts share the same filename in this fixture, this test
  // confirms the route resolves to the shareable post first.
  // See uploads.test.mjs fixture notes for details.
  const res = await get(`/uploads/${TEST_FILE}`, clientToken);
  // client_user has view+comment on smoke client
  // canAccessPost checks visibility: "internal" for client_user role
  // The media lookup finds the FIRST media record (post-shareable-001)
  assert.equal(res.status, 200);
});

// ── Token-in-querystring (share link path) ────────────────────────────────────

test("token passed as query param ?token= also authenticates", async () => {
  const res = await fetch(`${BASE}/uploads/${TEST_FILE}?token=${ownerToken}`);
  assert.equal(res.status, 200);
});

test("invalid token in query param returns 401", async () => {
  const res = await fetch(`${BASE}/uploads/${TEST_FILE}?token=garbage`);
  assert.equal(res.status, 401);
});

// ── Path traversal guard ──────────────────────────────────────────────────────

test("path traversal via URL encoding is blocked (400 or 404, never 200)", async () => {
  // %2F-encoded slashes don't resolve as real slashes at the filesystem level,
  // so validateFilePath passes but the file doesn't exist → 404.
  // Either outcome is safe; 200 would be a breach.
  const res = await get("/uploads/..%2F..%2Fetc%2Fpasswd", ownerToken);
  assert.ok([400, 404].includes(res.status), `expected 400 or 404, got ${res.status}`);
});

test("path traversal with backslash returns 400 or 404", async () => {
  const res = await get("/uploads/..\\..\\etc\\passwd", ownerToken);
  assert.ok([400, 404].includes(res.status));
});
