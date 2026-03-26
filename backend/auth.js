import crypto from "node:crypto";
import { config } from "./config.js";

function b64(value) {
  return Buffer.from(value).toString("base64url");
}

function unb64(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payload) {
  return crypto.createHmac("sha256", config.authSecret).update(payload).digest("base64url");
}

export function createAuthToken(claims, ttlSeconds = 60 * 60 * 24 * 7) {
  const body = {
    ...claims,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  };
  const encoded = b64(JSON.stringify(body));
  return `${encoded}.${sign(encoded)}`;
}

export function verifyAuthToken(token) {
  if (!token || !token.includes(".")) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  if (sign(encoded) !== signature) return null;
  try {
    const body = JSON.parse(unb64(encoded));
    if (!body.exp || Date.now() / 1000 > body.exp) return null;
    return body;
  } catch {
    return null;
  }
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const derived = crypto.scryptSync(String(password || ""), salt, 64).toString("base64url");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password, passwordHash) {
  const value = String(passwordHash || "");
  const parts = value.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, expected] = parts;
  const actual = crypto.scryptSync(String(password || ""), salt, 64).toString("base64url");
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
