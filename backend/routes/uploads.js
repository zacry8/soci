import fs from "node:fs/promises";
import path from "node:path";
import { verifyAuthToken } from "../auth.js";
import { loadState } from "../db.js";
import { ADMIN_ROLES, buildAccessContext, canAccessPost } from "../permissions.js";
import { json, parseUrl, validateFilePath } from "../utils.js";

const MIME_BY_EXTENSION = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".pdf": "application/pdf"
};

function buildOwnerFromClaims(claims) {
  return {
    id: claims.userId || "owner-admin",
    email: claims.email || "",
    name: "Owner",
    role: claims.role || "owner_admin"
  };
}

export function registerUploadRoutes(router, config) {
  // GET /uploads/:filename — serve uploaded media files
  // Note: registered as a catch-all prefix, matched manually since router doesn't support wildcards
  router.get("/uploads/:filename", async (req, res, params) => {
    const fileName = path.basename(params.filename);
    const absolute = validateFilePath(fileName, config.uploadDir);
    if (!absolute) return json(res, 400, { error: "Invalid file path" });
    const { searchParams } = parseUrl(req);
    const authHeader = req.headers.authorization || "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const token = bearerToken || String(searchParams.get("token") || "");
    const claims = verifyAuthToken(token);
    if (!claims?.role) return json(res, 401, { error: "Unauthorized" });

    const state = await loadState();
    const media = (state.media || []).find((item) => path.basename(item?.urlPath || "") === fileName);
    if (!media) return json(res, 404, { error: "File not found" });
    const post = (state.posts || []).find((item) => item.id === media.postId);
    if (!post) return json(res, 404, { error: "File not found" });

    if (claims.role === "share") {
      const linkRecord = (state.shareLinks || []).find(
        (link) => link.token === token && link.clientId === claims.clientId && !link.revokedAt
      );
      if (!linkRecord || claims.clientId !== post.clientId || post.visibility !== "client-shareable") {
        return json(res, 403, { error: "Forbidden" });
      }
    } else if (!ADMIN_ROLES.has(claims.role)) {
      const user = (state.users || []).find((value) => value.id === claims.userId && !value.disabledAt);
      if (!user) return json(res, 401, { error: "Unauthorized" });
      const access = buildAccessContext(state, user);
      if (!canAccessPost(access, post, "view")) {
        return json(res, 403, { error: "Forbidden" });
      }
    } else {
      const user = (state.users || []).find((value) => value.id === claims.userId && !value.disabledAt) || buildOwnerFromClaims(claims);
      const access = buildAccessContext(state, user);
      if (!canAccessPost(access, post, "view")) {
        return json(res, 403, { error: "Forbidden" });
      }
    }

    const forceDownload = searchParams.get("download") === "1";

    try {
      const data = await fs.readFile(absolute);
      const ext = path.extname(fileName).toLowerCase();
      const contentType = MIME_BY_EXTENSION[ext] || "application/octet-stream";
      const isInline = contentType.startsWith("image/") || contentType.startsWith("video/") || contentType === "application/pdf";
      const disposition = forceDownload
        ? `attachment; filename="${fileName}"`
        : isInline
          ? "inline"
          : `attachment; filename="${fileName}"`;
      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": data.length,
        "Content-Disposition": disposition,
        "Cache-Control": "public, max-age=31536000, immutable"
      });
      return res.end(data);
    } catch {
      return json(res, 404, { error: "File not found" });
    }
  });
}
