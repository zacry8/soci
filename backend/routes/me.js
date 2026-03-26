import { verifyAuthToken } from "../auth.js";
import { addPostComment, loadState } from "../db.js";
import { id, json, readJsonBody } from "../utils.js";
import { validateComment } from "../validators.js";

const ADMIN_ROLES = new Set(["owner_admin", "admin"]);
const PERMISSION_ORDER = ["view", "comment", "edit", "manage"];

function canUsePermission(membershipPermissions = [], required = "view") {
  const requiredRank = PERMISSION_ORDER.indexOf(required);
  if (requiredRank < 0) return false;
  const highestRank = membershipPermissions.reduce((rank, permission) => {
    const value = PERMISSION_ORDER.indexOf(permission);
    return value > rank ? value : rank;
  }, -1);
  return highestRank >= requiredRank;
}

function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name || "",
    role: user.role || "client_user"
  };
}

function buildOwnerFromClaims(claims) {
  return {
    id: claims.userId || "owner-admin",
    email: claims.email || "",
    name: "Owner",
    role: claims.role || "owner_admin"
  };
}

async function requireUser(req, res) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const claims = verifyAuthToken(token);
  if (!claims || !claims.role) {
    json(res, 401, { error: "Unauthorized" });
    return null;
  }

  const state = await loadState();
  const user = state.users.find((value) => value.id === claims.userId) || null;
  if (!user && !ADMIN_ROLES.has(claims.role)) {
    json(res, 401, { error: "Unauthorized" });
    return null;
  }

  return {
    claims,
    state,
    user: user || buildOwnerFromClaims(claims)
  };
}

export function registerMeRoutes(router, config) {
  // GET /api/me/state — role-scoped state for owner/helper/client users
  router.get("/api/me/state", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;

    const { user, state } = auth;
    if (user.disabledAt) return json(res, 403, { error: "User disabled" });
    if (ADMIN_ROLES.has(user.role)) {
      return json(res, 200, {
        user: toPublicUser(user),
        clients: state.clients,
        memberships: state.memberships,
        posts: state.posts,
        media: state.media,
        apiBaseUrl: config.apiBaseUrl
      });
    }

    const memberships = state.memberships.filter((membership) => membership.userId === user.id);
    const allowedClientIds = new Set(
      memberships
        .filter((membership) => canUsePermission(membership.permissions, "view"))
        .map((membership) => membership.clientId)
    );
    const clients = state.clients.filter((client) => allowedClientIds.has(client.id));
    const posts = state.posts.filter((post) => {
      if (!allowedClientIds.has(post.clientId)) return false;
      if (user.role === "client_user" && post.visibility === "internal") return false;
      return true;
    });
    const postIds = new Set(posts.map((post) => post.id));
    const media = state.media.filter((record) => postIds.has(record.postId));

    return json(res, 200, {
      user: toPublicUser(user),
      clients,
      memberships,
      posts,
      media,
      apiBaseUrl: config.apiBaseUrl
    });
  });

  // POST /api/me/posts/:postId/comments — add comment if membership allows comment/edit/manage
  router.post("/api/me/posts/:postId/comments", async (req, res, params) => {
    const auth = await requireUser(req, res);
    if (!auth) return;

    const { user, state } = auth;
    if (!params?.postId) return json(res, 400, { error: "postId required" });

    const post = state.posts.find((item) => item.id === params.postId);
    if (!post) return json(res, 404, { error: "Post not found" });

    if (!ADMIN_ROLES.has(user.role)) {
      const membership = state.memberships.find(
        (item) => item.userId === user.id && item.clientId === post.clientId
      );
      if (!membership || !canUsePermission(membership.permissions, "comment")) {
        return json(res, 403, { error: "Insufficient permissions" });
      }
      if (user.role === "client_user" && post.visibility === "internal") {
        return json(res, 403, { error: "Insufficient permissions" });
      }
    }

    const body = await readJsonBody(req, config.maxJsonBytes).catch((e) => ({ __error: e?.message || "Invalid JSON" }));
    if (body?.__error) return json(res, body.__error === "Payload too large" ? 413 : 400, { error: body.__error });
    const validationError = validateComment(body);
    if (validationError) return json(res, 400, { error: validationError });

    const comment = {
      id: id(),
      author: String(body.author || user.name || user.email || "Teammate").trim(),
      authorUserId: user.id,
      text: String(body.text || "").trim(),
      at: new Date().toISOString()
    };

    const updatedPost = await addPostComment(post.id, comment);
    if (!updatedPost) return json(res, 404, { error: "Post not found" });
    return json(res, 200, { post: updatedPost, comment });
  });
}
