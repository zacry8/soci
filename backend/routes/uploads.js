import fs from "node:fs/promises";
import path from "node:path";
import { json, validateFilePath } from "../utils.js";

export function registerUploadRoutes(router, config) {
  // GET /uploads/:filename — serve uploaded media files
  // Note: registered as a catch-all prefix, matched manually since router doesn't support wildcards
  router.get("/uploads/:filename", async (req, res, params) => {
    const fileName = path.basename(params.filename);
    const absolute = validateFilePath(fileName, config.uploadDir);
    if (!absolute) return json(res, 400, { error: "Invalid file path" });

    try {
      const data = await fs.readFile(absolute);
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": data.length,
        "Content-Disposition": "attachment",
      });
      return res.end(data);
    } catch {
      return json(res, 404, { error: "File not found" });
    }
  });
}
