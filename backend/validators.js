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
