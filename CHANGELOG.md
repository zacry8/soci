# Changelog

## 2026-03-29

### Owner Console Compatibility + UI Icon Fix
- Replaced invalid Lucide icon `calendar-down` with valid `calendar` icon in `index.html` to remove runtime icon replacement warnings.
- Added graceful compatibility fallback in `src/store.js` for environments where `/api/admin/users` and `/api/admin/users/stats` are not yet deployed.
  - 404 on these endpoints now returns empty owner-console payloads instead of throwing noisy sync errors.
- Added one-time UI warning in `src/main.js` when legacy deployment is detected so admins know backend needs update.

### Security + Tenant Isolation Hardening
- Fixed frontend session isolation so data from a previous user session is not reused after login/logout in the same browser tab.
  - Added explicit store session lifecycle methods (`refreshSession`, `resetSession`) in `src/store.js`.
  - Updated auth boot flow in `src/main.js` to reinitialize app subscriptions safely and force fresh scoped bootstrap after authentication.
- Hardened media retrieval access control in `backend/routes/uploads.js`.
  - `/uploads/:filename` now requires a valid token (Authorization header or `?token=` for media tags).
  - Enforced ownership/scope checks through media -> post -> workspace permission validation.
  - Preserved share-link behavior with strict client + visibility checks for share tokens.
- Updated frontend media URL normalization to append auth token to media URLs for authenticated rendering compatibility.
