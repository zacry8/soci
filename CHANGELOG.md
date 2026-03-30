# Changelog

## 2026-03-29

### Security + Tenant Isolation Hardening
- Fixed frontend session isolation so data from a previous user session is not reused after login/logout in the same browser tab.
  - Added explicit store session lifecycle methods (`refreshSession`, `resetSession`) in `src/store.js`.
  - Updated auth boot flow in `src/main.js` to reinitialize app subscriptions safely and force fresh scoped bootstrap after authentication.
- Hardened media retrieval access control in `backend/routes/uploads.js`.
  - `/uploads/:filename` now requires a valid token (Authorization header or `?token=` for media tags).
  - Enforced ownership/scope checks through media -> post -> workspace permission validation.
  - Preserved share-link behavior with strict client + visibility checks for share tokens.
- Updated frontend media URL normalization to append auth token to media URLs for authenticated rendering compatibility.
