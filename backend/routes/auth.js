import crypto from "node:crypto";
import { createAuthToken, hashPassword, verifyPassword } from "../auth.js";
import { findUserByEmail, upsertClient, upsertMembership, upsertUser } from "../db.js";
import { sendWelcomeEmail } from "../email.js";
import { json, readJsonBody } from "../utils.js";
import { validateRegistration } from "../validators.js";

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
  router.post("/api/auth/register", async (req, res) => {
    if (!config.allowSelfRegister) {
      return json(res, 403, { error: "Self-registration is disabled" });
    }

    const body = await readJsonBody(req, config.maxJsonBytes).catch((e) => ({ __error: e?.message || "Invalid JSON" }));
    if (body?.__error) {
      return json(res, body.__error === "Payload too large" ? 413 : 400, { error: body.__error });
    }

    const validationError = validateRegistration(body);
    if (validationError) return json(res, 400, { error: validationError });

    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    const password = String(body.password || "");
    const workspaceName = String(body.workspaceName || name || "My Workspace").trim();

    const existing = await findUserByEmail(email);
    if (existing) return json(res, 409, { error: "Email already in use" });

    let user;
    try {
      user = await upsertUser({
        email,
        name,
        role: "client_user",
        passwordHash: hashPassword(password)
      });
    } catch (error) {
      if (error?.code === "EMAIL_ALREADY_IN_USE") {
        return json(res, 409, { error: "Email already in use" });
      }
      throw error;
    }

    const workspace = await upsertClient({
      name: workspaceName,
      channels: ["Instagram"],
      sharingEnabled: false
    });

    await upsertMembership({
      userId: user.id,
      clientId: workspace.id,
      permissions: ["view", "comment", "edit", "manage"]
    });

    const token = createAuthToken({
      role: user.role || "client_user",
      userId: user.id,
      email: user.email
    });

    const emailResult = await sendWelcomeEmail({
      to: user.email,
      name: user.name,
      workspaceName: workspace.name || workspaceName
    });

    return json(res, 200, {
      token,
      role: user.role || "client_user",
      user: {
        id: user.id,
        email: user.email,
        name: user.name || "",
        role: user.role || "client_user"
      },
      workspace: {
        id: workspace.id,
        name: workspace.name || workspaceName
      },
      emailSent: Boolean(emailResult?.ok)
    });
  });

  router.post("/api/auth/login", async (req, res) => {
    const ip = req.socket.remoteAddress || "unknown";
    if (isRateLimited(ip)) {
      return json(res, 429, { error: "Too many login attempts. Try again in 15 minutes." });
    }

    const body = await readJsonBody(req, config.maxJsonBytes).catch((e) => ({ __error: e?.message || "Invalid JSON" }));
    if (body?.__error) {
      return json(res, body.__error === "Payload too large" ? 413 : 400, { error: body.__error });
    }

    const emailInput = String(body.email || "").trim().toLowerCase();
    const passwordInput = String(body.password || "");

    // Primary path: DB-backed users (owner/helper/client)
    const user = await findUserByEmail(emailInput);
    if (user && !user.disabledAt && verifyPassword(passwordInput, user.passwordHash)) {
      const token = createAuthToken({
        role: user.role || "client_user",
        userId: user.id,
        email: user.email
      });
      return json(res, 200, {
        token,
        role: user.role || "client_user",
        user: {
          id: user.id,
          email: user.email,
          name: user.name || "",
          role: user.role || "client_user"
        }
      });
    }

    // Backward-compatible fallback: env-admin credentials
    // Timing-safe comparison to prevent timing attacks
    const emailBuf    = Buffer.alloc(256);
    const passBuf     = Buffer.alloc(256);
    const emailExpBuf = Buffer.alloc(256);
    const passExpBuf  = Buffer.alloc(256);
    emailBuf.write(emailInput.slice(0, 255));
    passBuf.write(passwordInput.slice(0, 255));
    emailExpBuf.write(config.adminEmail.slice(0, 255));
    passExpBuf.write(config.adminPassword.slice(0, 255));
    const emailOk = crypto.timingSafeEqual(emailBuf, emailExpBuf);
    const passOk  = crypto.timingSafeEqual(passBuf, passExpBuf);

    if (!emailOk || !passOk) {
      return json(res, 401, { error: "Invalid credentials" });
    }

    const token = createAuthToken({ role: "owner_admin", email: config.adminEmail, userId: "owner-admin" });
    return json(res, 200, {
      token,
      role: "owner_admin",
      user: {
        id: "owner-admin",
        email: config.adminEmail,
        name: "Owner",
        role: "owner_admin"
      }
    });
  });
}
