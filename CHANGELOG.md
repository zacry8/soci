# Changelog

## 2026-03-29

### Owner Console Action UX (Icon + Row Reactive)
- Refined owner user-management action controls to be icon-first and more responsive per-row.
  - `src/main.js`: converted Enable/Disable/Reset/Resend/Delete to compact icon buttons with accessibility labels.
  - `src/main.js`: added row-scoped busy/disabled locking during async actions to prevent double-click races.
  - `src/main.js`: ensured Lucide icons hydrate after owner table render.
  - `styles/layout.css`: added `.owner-icon-btn` compact styling and busy/disabled states.

### UX Defaults + Owner Invite Resend
- Set **light mode as default** when no theme preference is saved.
  - Updated `src/main.js` theme initialization + fallback handling.
- Stopped disruptive inspector auto-open on startup.
  - Updated `src/store.js` bootstrap behavior so `activePostId` starts as `null` instead of first post.
- Added owner-console **Resend Invite** flow.
  - Backend endpoint: `POST /api/admin/users/:userId/resend-invite` in `backend/routes/admin.js` (owner-only).
  - Frontend wiring:
    - `src/api.js`: `resendAdminUserInvite()`
    - `src/store.js`: `adminResendUserInvite()`
    - `src/main.js`: "Resend Invite" button + action handling + success/warning toast.

### Owner Console Hard Delete (Owner-only)
- Added owner-only permanent user deletion flow with strict safeguards.
  - Backend: `DELETE /api/admin/users/:userId` in `backend/routes/admin.js`.
  - Guardrails enforced server-side:
    - cannot delete owner account
    - cannot delete your own account
    - user must be disabled first before permanent delete
- Added DB helper `deleteUserAndMemberships(userId)` in `backend/db.js`.
  - Removes user record and related memberships.
  - Preserves posts/history data model integrity (no broad cascade deletes).
- Wired frontend delete action in owner console:
  - `src/api.js`: `deleteAdminUser()`
  - `src/store.js`: `adminDeleteUser()`
  - `src/main.js`: shows **Delete** button only for disabled non-owner users, with destructive confirmation modal.

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
