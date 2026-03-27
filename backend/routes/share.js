import { verifyAuthToken } from "../auth.js";
import { loadState } from "../db.js";
import { json } from "../utils.js";

export function registerShareRoutes(router) {
  // GET /api/share/calendar — public calendar for clients via share token
  router.get("/api/share/calendar", async (req, res) => {
    const auth = req.headers.authorization || "";
    const shareToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const claims = verifyAuthToken(shareToken);
    if (!claims || claims.role !== "share" || !claims.clientId) {
      return json(res, 401, { error: "Invalid share token" });
    }

    const state = await loadState();
    const linkRecord = state.shareLinks.find(
      (l) => l.token === shareToken && l.clientId === claims.clientId && !l.revokedAt
    );
    if (!linkRecord) return json(res, 401, { error: "Share token revoked or not found" });

    const client = state.clients.find((c) => c.id === claims.clientId);
    if (!client) return json(res, 404, { error: "Client not found" });

    const posts = state.posts
      .filter((p) => p.clientId === client.id && p.visibility === "client-shareable")
      .map(({ id, clientId, title, caption, tags, platforms, status, visibility, scheduleDate, publishState, publishedAt, scheduledAt, postType, platformVariants, mediaIds, createdAt, updatedAt }) => ({
        id, clientId, title, caption, tags, platforms, status, visibility, scheduleDate, publishState, publishedAt, scheduledAt, postType, platformVariants, mediaIds, createdAt, updatedAt
      }));
    return json(res, 200, { client, posts });
  });
}
