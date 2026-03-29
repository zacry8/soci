const ADMIN_ROLES = new Set(["owner_admin", "admin"]);
const PERMISSION_ORDER = ["view", "comment", "edit", "manage"];

function highestPermission(permissions = []) {
  let best = "";
  let rank = -1;
  for (const permission of permissions) {
    const nextRank = PERMISSION_ORDER.indexOf(permission);
    if (nextRank > rank) {
      best = permission;
      rank = nextRank;
    }
  }
  return best;
}

export function canUsePermission(permissions = [], required = "view") {
  const requiredRank = PERMISSION_ORDER.indexOf(required);
  if (requiredRank < 0) return false;
  return PERMISSION_ORDER.indexOf(highestPermission(permissions)) >= requiredRank;
}

export function buildAccessContext(state, user) {
  const isAdmin = ADMIN_ROLES.has(user?.role);
  const memberships = isAdmin
    ? []
    : (state.memberships || []).filter((membership) => membership.userId === user.id);

  const permissionsByClient = {};
  const allowedClientIds = new Set();

  if (isAdmin) {
    for (const client of state.clients || []) {
      if (!client?.id) continue;
      permissionsByClient[client.id] = "manage";
      allowedClientIds.add(client.id);
    }
  } else {
    for (const membership of memberships) {
      const clientId = membership?.clientId;
      if (!clientId) continue;
      const highest = highestPermission(membership.permissions || []);
      if (!highest) continue;
      if (!permissionsByClient[clientId] || canUsePermission([highest], permissionsByClient[clientId])) {
        permissionsByClient[clientId] = highest;
      }
      if (canUsePermission(membership.permissions, "view")) {
        allowedClientIds.add(clientId);
      }
    }
  }

  return {
    isAdmin,
    user,
    memberships,
    allowedClientIds,
    permissionsByClient
  };
}

export function canAccessClient(context, clientId, required = "view") {
  if (context.isAdmin) return true;
  const highest = context.permissionsByClient[clientId] || "";
  return canUsePermission([highest], required);
}

export function canAccessPost(context, post, required = "view") {
  if (!post?.clientId) return false;
  if (!canAccessClient(context, post.clientId, required)) return false;
  if (context.user?.role === "client_user" && post.visibility === "internal") return false;
  return true;
}

export function getCapabilities(context) {
  const hasEditOnAnyClient = Object.keys(context.permissionsByClient).some((clientId) => canUsePermission([context.permissionsByClient[clientId]], "edit"));
  return {
    canManageUsers: context.isAdmin,
    canManageClients: context.isAdmin,
    canCreateClients: true,
    canCreatePosts: context.isAdmin || hasEditOnAnyClient,
    canDeletePosts: context.isAdmin,
    canUploadMedia: context.isAdmin || hasEditOnAnyClient
  };
}

export { ADMIN_ROLES, PERMISSION_ORDER };
