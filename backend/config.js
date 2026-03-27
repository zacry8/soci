import path from "node:path";

const rootDir = process.cwd();

export const config = {
  port: Number(process.env.PORT || 8787),
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:4174",
  apiBaseUrl: process.env.API_BASE_URL || "http://localhost:8787",
  corsOrigins: (process.env.CORS_ORIGINS || process.env.APP_BASE_URL || "http://localhost:4174")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  maxJsonBytes: Number(process.env.MAX_JSON_BYTES || 5 * 1024 * 1024),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 12 * 1024 * 1024),
  authSecret: process.env.AUTH_SECRET || "replace-this-in-production",
  adminEmail: process.env.ADMIN_EMAIL || "admin@soci.local",
  adminPassword: process.env.ADMIN_PASSWORD || "change-me-now",
  dataFile: process.env.DATA_FILE || path.join(rootDir, "backend", "data", "db.json"),
  uploadDir: process.env.UPLOAD_DIR || path.join(rootDir, "backend", "uploads"),
  backupDir: process.env.BACKUP_DIR || path.join(rootDir, "backups"),
  backupDataFile: process.env.BACKUP_DATA_FILE || process.env.DATA_FILE || path.join(rootDir, "backend", "data", "db.json"),
  backupUploadDir: process.env.BACKUP_UPLOAD_DIR || process.env.UPLOAD_DIR || path.join(rootDir, "backend", "uploads"),
  backupManifestVersion: Number(process.env.BACKUP_MANIFEST_VERSION || 1)
};
