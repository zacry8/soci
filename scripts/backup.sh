#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/soci}"
BACKUP_DIR="${BACKUP_DIR:-${APP_DIR}/backups}"
DATA_FILE="${BACKUP_DATA_FILE:-${DATA_FILE:-${APP_DIR}/backend/data/db.json}}"
UPLOAD_DIR="${BACKUP_UPLOAD_DIR:-${UPLOAD_DIR:-${APP_DIR}/backend/uploads}}"
MANIFEST_VERSION="${BACKUP_MANIFEST_VERSION:-1}"
POST_BACKUP_HOOK="${POST_BACKUP_HOOK:-}"

STAMP="$(date +"%Y%m%d-%H%M%S")"
TMP_DIR="${BACKUP_DIR}/tmp-${STAMP}"
PAYLOAD_DIR="${TMP_DIR}/payload"
ARCHIVE="${BACKUP_DIR}/soci-backup-${STAMP}.tar.gz"

mkdir -p "${BACKUP_DIR}" "${PAYLOAD_DIR}" "${PAYLOAD_DIR}/uploads"

if [ ! -f "${DATA_FILE}" ]; then
  echo "backup failed: DATA_FILE not found at ${DATA_FILE}" >&2
  rm -rf "${TMP_DIR}"
  exit 1
fi

if [ ! -d "${UPLOAD_DIR}" ]; then
  echo "backup failed: UPLOAD_DIR not found at ${UPLOAD_DIR}" >&2
  rm -rf "${TMP_DIR}"
  exit 1
fi

cp "${DATA_FILE}" "${PAYLOAD_DIR}/db.json"
cp -R "${UPLOAD_DIR}/." "${PAYLOAD_DIR}/uploads/" 2>/dev/null || true

# Validate DB JSON before snapshotting
node --input-type=module -e 'import fs from "node:fs"; JSON.parse(fs.readFileSync(process.argv[1], "utf8"));' "${PAYLOAD_DIR}/db.json"

# Build deterministic manifest + checksums
node --input-type=module - "${PAYLOAD_DIR}" "${MANIFEST_VERSION}" "${STAMP}" "${APP_DIR}" <<'NODE'
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const [payloadDir, manifestVersion, stamp, appDir] = process.argv.slice(2);

const walk = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(absolute));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }
  return files;
};

const sha256 = (absolutePath) => {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(absolutePath));
  return hash.digest("hex");
};

const allFiles = walk(payloadDir)
  .map((absolute) => {
    const relPath = path.relative(payloadDir, absolute).replaceAll(path.sep, "/");
    const stats = fs.statSync(absolute);
    return {
      path: relPath,
      bytes: stats.size,
      sha256: sha256(absolute)
    };
  })
  .sort((a, b) => a.path.localeCompare(b.path));

const dbFile = allFiles.find((file) => file.path === "db.json") || null;
const mediaFiles = allFiles.filter((file) => file.path.startsWith("uploads/"));
const mediaBytes = mediaFiles.reduce((sum, file) => sum + file.bytes, 0);
let gitCommit = "unknown";

try {
  gitCommit = String(execSync("git rev-parse --short HEAD", { cwd: appDir, stdio: ["ignore", "pipe", "ignore"] }))
    .trim();
} catch {
  // best effort
}

const manifest = {
  manifestVersion: Number(manifestVersion) || 1,
  createdAt: new Date().toISOString(),
  backupStamp: stamp,
  hostname: process.env.HOSTNAME || "unknown",
  gitCommit,
  summary: {
    fileCount: allFiles.length,
    mediaCount: mediaFiles.length,
    mediaBytes
  },
  dbFile,
  mediaFiles,
  files: allFiles
};

fs.writeFileSync(path.join(payloadDir, "manifest.json"), JSON.stringify(manifest, null, 2));
NODE

tar -czf "${ARCHIVE}" -C "${PAYLOAD_DIR}" .
rm -rf "${TMP_DIR}"

# Keep latest 7 backups
ls -1t "${BACKUP_DIR}"/soci-backup-*.tar.gz 2>/dev/null | tail -n +8 | xargs -r rm -f

if [ -n "${POST_BACKUP_HOOK}" ]; then
  BACKUP_ARCHIVE="${ARCHIVE}" BACKUP_DIR="${BACKUP_DIR}" bash -lc "${POST_BACKUP_HOOK}" || {
    echo "backup warning: POST_BACKUP_HOOK failed" >&2
  }
fi

echo "backup created: ${ARCHIVE}"
