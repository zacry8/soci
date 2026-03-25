#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/soci"
BACKUP_DIR="${APP_DIR}/backups"
STAMP="$(date +"%Y%m%d-%H%M%S")"
TMP_DIR="${BACKUP_DIR}/tmp-${STAMP}"
ARCHIVE="${BACKUP_DIR}/soci-backup-${STAMP}.tar.gz"

mkdir -p "${BACKUP_DIR}" "${TMP_DIR}"

if [ -f "${APP_DIR}/backend/data/db.json" ]; then
  cp "${APP_DIR}/backend/data/db.json" "${TMP_DIR}/db.json"
fi

if [ -d "${APP_DIR}/backend/uploads" ]; then
  cp -R "${APP_DIR}/backend/uploads" "${TMP_DIR}/uploads"
fi

tar -czf "${ARCHIVE}" -C "${TMP_DIR}" .
rm -rf "${TMP_DIR}"

# Keep latest 7 backups
ls -1t "${BACKUP_DIR}"/soci-backup-*.tar.gz 2>/dev/null | tail -n +8 | xargs -r rm -f

echo "backup created: ${ARCHIVE}"
