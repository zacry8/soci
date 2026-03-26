import crypto from "node:crypto";
import { createAuthToken } from "../auth.js";
import { json, readJsonBody } from "../utils.js";

// Rate limiting: max 10 login attempts per IP per 15 minutes
const loginAttempts = new Map();
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 10;

function isRateLimited(ip) {
  const now = Date.now();
  let entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW_MS };
  }
  entry.count++;
  loginAttempts.set(ip, entry);
  return entry.count > RATE_MAX;
}

export function registerAuthRoutes(router, config) {
  router.post("/api/auth/login", async (req, res) => {
    const ip = req.socket.remoteAddress || "unknown";
    if (isRateLimited(ip)) {
      return json(res, 429, { error: "Too many login attempts. Try again in 15 minutes." });
    }

    const body = await readJsonBody(req, config.maxJsonBytes).catch((e) => ({ __error: e?.message || "Invalid JSON" }));
    if (body?.__error) {
      return json(res, body.__error === "Payload too large" ? 413 : 400, { error: body.__error });
    }

    // Timing-safe comparison to prevent timing attacks
    const emailBuf    = Buffer.alloc(256);
    const passBuf     = Buffer.alloc(256);
    const emailExpBuf = Buffer.alloc(256);
    const passExpBuf  = Buffer.alloc(256);
    emailBuf.write(String(body.email || "").slice(0, 255));
    passBuf.write(String(body.password || "").slice(0, 255));
    emailExpBuf.write(config.adminEmail.slice(0, 255));
    passExpBuf.write(config.adminPassword.slice(0, 255));
    const emailOk = crypto.timingSafeEqual(emailBuf, emailExpBuf);
    const passOk  = crypto.timingSafeEqual(passBuf, passExpBuf);

    if (!emailOk || !passOk) {
      return json(res, 401, { error: "Invalid credentials" });
    }

    const token = createAuthToken({ role: "admin", email: config.adminEmail });
    return json(res, 200, { token, role: "admin" });
  });
}
