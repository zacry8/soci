import fs from "node:fs/promises";
import path from "node:path";
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

export function registerUploadRoutes(router, config) {
  // GET /uploads/:filename — serve uploaded media files
  // Note: registered as a catch-all prefix, matched manually since router doesn't support wildcards
  router.get("/uploads/:filename", async (req, res, params) => {
    const fileName = path.basename(params.filename);
    const absolute = validateFilePath(fileName, config.uploadDir);
    if (!absolute) return json(res, 400, { error: "Invalid file path" });
    const { searchParams } = parseUrl(req);
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
