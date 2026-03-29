// Input validation for client and post payloads.
// Each function returns a string error message or null if valid.

export function validateClient(body) {
  if (!body.id && (typeof body.name !== "string" || !body.name.trim()))
    return "name is required";
  if (body.name !== undefined && (typeof body.name !== "string" || body.name.length > 100))
    return "name must be a string up to 100 characters";
  if (body.channels !== undefined && (
    !Array.isArray(body.channels) || body.channels.length > 20 ||
    body.channels.some(c => typeof c !== "string" || c.length > 50)
  )) return "channels must be an array of up to 20 strings (max 50 chars each)";
  if (body.shareSlug !== undefined && (typeof body.shareSlug !== "string" || body.shareSlug.length > 100))
    return "shareSlug must be a string up to 100 characters";
  if (body.sharingEnabled !== undefined && typeof body.sharingEnabled !== "boolean")
    return "sharingEnabled must be a boolean";
  if (body.profileSettings !== undefined) {
    if (!body.profileSettings || typeof body.profileSettings !== "object" || Array.isArray(body.profileSettings)) {
      return "profileSettings must be an object";
    }
    const limits = {
      handle: 80,
      displayName: 120,
      avatarUrl: 500,
      followers: 50,
      following: 50,
      likes: 50,
      bio: 400,
      linkText: 120,
      linkUrl: 500
    };
    const allowed = new Set(Object.keys(limits));
    for (const [key, value] of Object.entries(body.profileSettings)) {
      if (!allowed.has(key)) return `profileSettings contains unsupported field: ${key}`;
      if (typeof value !== "string") return `profileSettings.${key} must be a string`;
      if (value.length > limits[key]) return `profileSettings.${key} must be at most ${limits[key]} characters`;
    }
  }
  return null;
}

const VALID_STATUSES = new Set([
  "idea",
  "in-progress",
  "in-review",
  "ready",
  // legacy/back-compat values
  "draft",
  "scheduled",
  "published"
]);
const VALID_VISIBILITIES = new Set(["client-shareable", "internal"]);
const VALID_USER_ROLES = new Set(["owner_admin", "admin", "helper_staff", "client_user"]);
const VALID_MEMBERSHIP_PERMISSIONS = new Set(["view", "comment", "edit", "manage"]);

export function validateRegistration(body) {
  if (!body || typeof body !== "object") return "Invalid payload";

  const email = String(body.email || "").trim().toLowerCase();
  if (!email) return "email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return "email must be a valid email up to 200 characters";
  }

  const name = String(body.name || "").trim();
  if (!name) return "name is required";
  if (name.length > 100) return "name must be a string up to 100 characters";

  const password = String(body.password || "");
  if (password.length < 8 || password.length > 200) {
    return "password must be a string between 8 and 200 characters";
  }

  const workspaceName = String(body.workspaceName || name || "").trim();
  if (!workspaceName) return "workspaceName is required";
  if (workspaceName.length > 100) return "workspaceName must be a string up to 100 characters";

  return null;
}

export function validatePost(body) {
  if (!body.id && !body.clientId) return "clientId is required";
  if (body.title !== undefined && (typeof body.title !== "string" || body.title.length > 200))
    return "title must be a string up to 200 characters";
  if (body.caption !== undefined && (typeof body.caption !== "string" || body.caption.length > 10000))
    return "caption must be a string up to 10,000 characters";
  if (body.tags !== undefined && (
    !Array.isArray(body.tags) || body.tags.length > 30 ||
    body.tags.some(t => typeof t !== "string" || t.length > 100)
  )) return "tags must be an array of up to 30 strings (max 100 chars each)";
  if (body.platforms !== undefined && (
    !Array.isArray(body.platforms) || body.platforms.length > 20 ||
    body.platforms.some(p => typeof p !== "string" || p.length > 50)
  )) return "platforms must be an array of up to 20 strings (max 50 chars each)";
  if (body.status !== undefined && !VALID_STATUSES.has(body.status))
    return `status must be one of: ${[...VALID_STATUSES].join(", ")}`;
  if (body.visibility !== undefined && !VALID_VISIBILITIES.has(body.visibility))
    return `visibility must be one of: ${[...VALID_VISIBILITIES].join(", ")}`;
  return null;
}

export function validateUser(body) {
  if (!body.id && (!body.email || typeof body.email !== "string")) return "email is required";
  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
      return "email must be a valid email up to 200 characters";
    }
  }
  if (body.name !== undefined && (typeof body.name !== "string" || body.name.length > 100)) {
    return "name must be a string up to 100 characters";
  }
  if (body.role !== undefined && !VALID_USER_ROLES.has(body.role)) {
    return `role must be one of: ${[...VALID_USER_ROLES].join(", ")}`;
  }
  if (!body.id && !body.password) return "password is required when creating a user";
  if (body.password !== undefined && (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 200)) {
    return "password must be a string between 8 and 200 characters";
  }
  return null;
}

export function validateMembership(body) {
  if (!body?.userId) return "userId is required";
  if (!body?.clientId) return "clientId is required";
  if (body.permissions !== undefined) {
    if (!Array.isArray(body.permissions) || !body.permissions.length) {
      return "permissions must be a non-empty array";
    }
    const invalid = body.permissions.find((value) => !VALID_MEMBERSHIP_PERMISSIONS.has(value));
    if (invalid) return `invalid permission: ${invalid}`;
  }
  return null;
}

export function validateComment(body) {
  const text = String(body?.text || "").trim();
  if (!text) return "text is required";
  if (text.length > 2000) return "text must be 2000 characters or less";
  return null;
}
