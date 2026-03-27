#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:-}"

if [ -z "${ARCHIVE_PATH}" ]; then
  echo "usage: scripts/verify-backup.sh /path/to/soci-backup-YYYYMMDD-HHMMSS.tar.gz" >&2
  exit 1
fi

if [ ! -f "${ARCHIVE_PATH}" ]; then
  echo "verify failed: archive not found at ${ARCHIVE_PATH}" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

tar -xzf "${ARCHIVE_PATH}" -C "${TMP_DIR}"

if [ ! -f "${TMP_DIR}/manifest.json" ]; then
  echo "verify failed: manifest.json missing from archive" >&2
  exit 1
fi

if [ ! -f "${TMP_DIR}/db.json" ]; then
  echo "verify failed: db.json missing from archive" >&2
  exit 1
fi

node --input-type=module - "${TMP_DIR}" <<'NODE'
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const [extractDir] = process.argv.slice(2);

const fail = (message) => {
  console.error(`verify failed: ${message}`);
  process.exit(1);
};

const manifestPath = path.join(extractDir, "manifest.json");
const dbPath = path.join(extractDir, "db.json");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (!manifest || typeof manifest !== "object") fail("manifest is not an object");
if (!Array.isArray(manifest.files) || !manifest.files.length) fail("manifest.files missing or empty");

const state = JSON.parse(fs.readFileSync(dbPath, "utf8"));
const files = manifest.files;

const sha256 = (absolutePath) => {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(absolutePath));
  return hash.digest("hex");
};

for (const file of files) {
  if (!file || typeof file.path !== "string") fail("manifest has invalid file entry");
  const absolute = path.join(extractDir, file.path);
  if (!fs.existsSync(absolute)) fail(`file listed in manifest is missing: ${file.path}`);
  const stats = fs.statSync(absolute);
  if (stats.size !== Number(file.bytes)) fail(`size mismatch for ${file.path}`);
  if (sha256(absolute) !== file.sha256) fail(`checksum mismatch for ${file.path}`);
}

const mediaRecords = Array.isArray(state.media) ? state.media : [];
for (const media of mediaRecords) {
  const urlPath = String(media?.urlPath || "").split("?")[0];
  const relative = urlPath.replace(/^\/+/, "");
  if (!relative.startsWith("uploads/")) continue;
  const absolute = path.join(extractDir, relative);
  if (!fs.existsSync(absolute)) {
    fail(`db media reference missing in backup payload: ${relative} (media id=${media?.id || "unknown"})`);
  }
}

console.log("verify ok:", {
  manifestVersion: manifest.manifestVersion,
  filesVerified: files.length,
  mediaReferencesChecked: mediaRecords.length
});
NODE
