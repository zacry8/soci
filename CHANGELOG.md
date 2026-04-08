# Changelog

## 2026-04-07

### External Media Attach UX Hardening (Provider Auto-Normalization)
- Made cloud-link attach flow more forgiving and automatic for provider input.
  - `src/store.js`:
    - added provider alias normalization (`google drive`, `gdrive`, `one drive`, etc. → backend-safe enum values)
    - added URL-based provider inference fallback when provider text is noisy/unknown
    - added client-side HTTPS preflight validation with user-friendly messages before request
    - added single automatic retry path for provider-only 400 errors using backend auto-detect mode (`provider: ""`)
- Improved attach failure messaging in inspector to be more intuitive.
  - `src/render/inspector.js`:
    - provider validation failures now explain Auto-detect/direct-link guidance in plain language
    - invalid URL failures now prompt for full HTTPS cloud links with examples
  - `src/api.js`:
    - fixed external-media request serialization to omit empty optional fields (`provider`, `displayName`, `nativeBookmarkHint`) so backend auto-detect fallback is not blocked by empty-string provider values.
  - `src/render/inspector.js`:
    - added clearer guidance for non-public cloud links (e.g., private Google Drive URLs) when backend returns public-link hints.
  - `src/render/shared.js` + `src/render/kanban.js`:
    - external media now degrades gracefully in board/profile-style previews by rendering an "External media" fallback card with source-open affordance instead of attempting fragile inline provider fetches.
  - `src/render/shared.js` + `src/render/kanban.js`:
    - added no-proxy Google Drive preview optimization using Drive thumbnail URLs (`/thumbnail?id=...&sz=w1000`) plus `referrerpolicy="no-referrer"` for inline preview tags to reduce hotlink 403 failures without backend proxying.

### Production API Route Drift Diagnosis — External Media Endpoints
- Investigated `404 Not Found` on external media attach endpoints reported by frontend (`POST /api/admin/media/external`).
- Production probes confirmed route drift behavior:
  - `POST /api/admin/media/external` → `404 Not found`
  - `POST /api/me/media/external` → `404 Not found`
  - `POST /api/admin/media` → `401 Unauthorized` (route exists)
- Conclusion: production backend is reachable and admin routes are mounted, but deployed API revision is missing BYOS external media routes.
- Recommended remediation:
  - On VPS (`/root/soci`), force deploy latest `main` and rebuild container:
    - `git pull origin main`
    - `docker compose -f /root/docker-compose.yml up -d --build soci`
  - Re-verify endpoint returns non-404 (401/400/403 acceptable without valid auth/payload).

### UI Polish Pass — Calendar + Workflow Controls + Sidebar Order
- Reduced visual noise in calendar quick-add interaction.
  - `src/render/calendar.js`: changed day quick-add control from `+ Quick add` label to compact `+` icon-only button with preserved accessibility labels.
  - `styles/views.css`: updated quick-add shape/hover to round, subtle-by-default, and branded hover state aligned with primary action language.
- Scoped View Options to Kanban context as requested.
  - `index.html`: removed topbar-level `View Options` block.
  - `index.html` + `styles/views.css`: added Kanban-only floating gear control (`#kanban-view-options-panel`) pinned to workflow board top-right.
  - Kanban options remain persisted through existing `soci.kanban.view-options.v1` wiring.
- Improved control hierarchy and readability.
  - `index.html`: moved theme switch above sign-out in sidebar.
  - `styles/layout.css`: increased pin workspace control legibility and refined topbar spacing/alignment (`topbar-main`, `workspace-controls`, title/stat rhythm).
- Validation:
  - `node --check src/render/calendar.js`
  - `node --check src/main.js`

### Workflow Friction Pass — Workspace Persistence + Quick Actions
- Reduced repeat setup clicks after refresh/login and prioritized default workspace recovery.
  - `src/main.js`: added pinned workspace persistence (`soci.workspace.pinned.v1`) and last-active workspace memory (`soci.workspace.last-active.v1`) with preferred workspace resolution at bootstrap.
  - `index.html` + `src/main.js`: wired workspace pin control state (`Pin Workspace` / `Pinned`) and persisted active workspace changes.
- Added low-friction creation and keyboard-first navigation.
  - `src/main.js` + `src/render/kanban.js`/`src/render/calendar.js`: quick-add stubs from Workflow lanes and Calendar dates.
  - `index.html` + `src/main.js` + `styles/views.css`: global Command Palette (`Cmd/Ctrl+K`) for workspace switching, theme toggle, new post, and view focus.
- Added bulk intake + schedule movement shortcuts.
  - `src/main.js`: media dump drag-and-drop zones (Calendar + Rows section) to auto-create draft posts from dropped files and HTTPS links (BYOS attach flow).
  - `src/main.js` + `src/render/calendar.js`: drag workflow post to date scheduling flow updates `scheduleDate`, `publishState`, and preserves status rules.
- Improved readiness scanning in Rows view.
  - `src/render/table.js` + `styles/views.css`: replaced plain readiness text with traffic-light indicator + progress bar + percent for at-a-glance weekly review.
- Validation:
  - `node --check src/main.js`
  - `node --check src/render/calendar.js`
  - `node --check src/render/kanban.js`
  - `node --check src/render/table.js`

### BYOS Attach-by-Link Reliability Hardening
- Hardened external media attach flow to reduce recurring 404/validation loops and improve diagnostics.
  - `src/store.js`: added `normalizeExternalMediaUrl(...)` to convert Google Drive `/file/d/.../view` links to direct-download form before attach requests.
  - `src/api.js`: request errors now preserve `status`, `code`, and `hint` fields from API responses.
  - `src/render/inspector.js`: added attach-by-link hint text and clearer status messaging for 404/403/400 failure classes.
  - `backend/routes/admin.js` + `backend/routes/me.js`: standardized external-media errors with explicit `code` and actionable `hint` payloads (`invalid_json`, `invalid_external_media_payload`, `invalid_external_url`, `post_not_found`, `insufficient_permissions`).
- Verification:
  - `node --test backend/tests/uploads.test.mjs backend/tests/role-matrix.test.mjs` passed (`27/27`).

### BYOS External Media + Publish Handoff (Implemented)
- Added secure BYOS-style external media reference support across API + store + inspector.
  - Backend:
    - `backend/utils.js`: safe external URL guardrails (`https` only, private/local host blocking), provider detection/normalization.
    - `backend/validators.js`: `validateExternalMediaReference` with provider/display/native hint bounds.
    - `backend/db.js`: external media persistence (`storageMode`, `provider`, `externalUrl`, `displayName`, `nativeBookmarkHint`) + `addExternalMedia(...)`.
    - `backend/routes/admin.js`: `POST /api/admin/media/external`.
    - `backend/routes/me.js`: `POST /api/me/media/external` with scoped permission checks.
- Added frontend attach-by-link flow and mixed media rendering.
  - `src/api.js`: external media endpoints for admin and scoped users.
  - `src/store.js`: external media normalization + `attachExternalMedia(...)` mutation path.
  - `src/render/inspector.js`: Attach by Link inputs, BYOS badges, external action buttons (open/copy), external-aware preview rendering.
  - `styles/utilities.css`: BYOS attach/pill/preview styles.
- Added web publish handoff workflow (link-only flow + confirmation loop).
  - `src/main.js`: platform handoff URL routing, caption clipboard copy, platform/media open sequence, and "Did this post successfully publish?" confirmation to mark post `published`.
- Verification:
  - `npm test` passed (`27/27`).

### Sidebar + View UX Consistency Pass
- Standardized sidebar button typography to match Export-sized text while keeping `+ New Post` bold/emphasized.
  - `styles/layout.css`: unified sidebar action font sizing/weights for `small`, `action-btn`, and export summary controls.
- Moved theme control to a Soci-style switch in the left sidebar.
  - `index.html`: replaced topbar theme button with sidebar `#theme-toggle` switch.
  - `src/main.js`: updated theme label/pressed-state behavior for switch UI.
  - `styles/layout.css`: added `.theme-switch` styles and animated knob state.
- Improved Rows section clarity (RoseView/Rows behavior).
  - `index.html`: renamed actions to **Copy to Sheets** and **Paste Rows**.
  - `styles/views.css`: removed hover-only hiding so row import/export controls stay visible.

### Kanban + Preview Customization Controls
- Added top-level **View Options** controls for per-view visibility toggles.
  - `index.html`: added checkboxes for Kanban thumbnails/meta/description and Preview thumbnails/meta/description/text-only.
  - `src/main.js`: added persisted options state via localStorage:
    - `soci.kanban.view-options.v1`
    - `soci.preview.view-options.v1`
- Extended Kanban rendering to support configurable card visibility.
  - `src/render/kanban.js`: added optional thumbnail rendering (from post media), and hide/show toggles for meta/excerpt.
  - `styles/views.css`: added `.card-thumb`, `.hide-card-meta`, `.hide-card-excerpt` styling.
- Extended Profile Preview (Instagram/TikTok mock views) with text-only and selective metadata display.
  - `src/render/profileSimulator.js`: added displayOptions-aware rendering for thumbnail/meta/description/text-only modes.
  - `styles/feeds.css`: added `.mock-tile-caption` and `.profile-text-list` styles.

### Kanban Edge Artifact Cleanup
- Removed accidental right/left edge gradient overlays from workflow section.
  - `styles/views.css`: removed pseudo-element edge fade rules tied to `overflow-left/right` classes.

### Architecture Outline Added (Publishing Handoff + BYOS)
- Documented implementation direction for:
  - deep-link routing + clipboard-assisted publish handoff workflow,
  - user-confirmation callback loop for "posted successfully" state,
  - BYOS media strategy (external file references first, optional native bookmark workflows later).
  - See `memory-bank.md` for scoped roadmap notes.

## 2026-04-06

### Upload Access Enforcement Integration Tests
- Added `backend/tests/uploads.test.mjs` — 12 integration tests covering `GET /uploads/:filename` auth and access control.
  - No token / malformed token / wrong-secret token → 401
  - User not in DB (valid token, unknown userId) → 401
  - Owner, helper, client_user access verified against fixture
  - Token-in-querystring (`?token=`) path tested
  - Path traversal (URL-encoded %2F, backslash) confirmed blocked
- Added `backend/data/upload-smoke-db.json` and `backend/uploads-smoke/test-media-upload.png` test fixtures
- Full suite: `npm test` → **27/27 pass**

### Role Matrix Integration Tests
- Added `backend/tests/role-matrix.test.mjs` — 15 integration tests covering the full permission boundary at the HTTP layer.
  - Unauthenticated requests → 401
  - helper/client blocked from `/api/admin/state` → 401
  - Owner sees all posts including `internal` visibility
  - helper (view+comment+edit) can create posts; sees internal posts
  - client_user cannot create posts, cannot see internal posts, cannot comment on internal posts, cannot mutate cross-workspace
- Added `npm test` script: `node --test backend/tests/*.test.mjs`
- Tests use a read-only fixture (`permission-smoke-db.json`) and spawn a test server on port 8788

## 2026-04-04

### Table View Blank Input Row for Sheets Paste/Create
- Added an always-visible blank input row at the bottom of Table view for faster spreadsheet-style entry.
  - `src/render/table.js`:
    - introduced synthetic row id `__new_row__`
    - added visual prompt text (`Paste rows here…`)
    - prevented normal inline edit/open behavior on the synthetic row
    - added create-mode paste path: when paste starts on blank row, pasted cells are converted into new row payloads instead of post updates.
- Wired blank-row create flow to existing secure bulk create pipeline.
  - `src/main.js`:
    - passes `activeClientId` into table renderer for sensible workspace defaults
    - adds `onBatchCreateRows` callback that calls `store.bulkCreatePosts(...)`
    - preserves existing permission checks + success/warning toast feedback.
- Added styling cues to make the blank input row discoverable.
  - `styles/views.css`: `row-input`/`cell-input-row` styling and subtle highlight states.

### Responsive Topbar Toggle Bar Refresh (Icons + Long Segmented Layout)
- Refined topbar view toggle placement to prevent awkward stacking on smaller screens.
  - `index.html`: moved view toggle group into a dedicated `topbar-main` block directly under/near the `Planning Workspace` heading.
  - Added view toggle icons while preserving text labels:
    - Kanban (`columns-3`)
    - Calendar (`calendar-days`)
    - Table (`table`)
    - Grid (`grid-3x3`)
- Updated toggle styling for a longer segmented control feel.
  - `styles/layout.css`: converted `.view-toggles` to a full-width 4-column bar with stronger alignment and icon/text support.
  - `styles/layout.css`: introduced `.topbar-main` + `.topbar-title-block` for cleaner heading/toggle grouping.
- Improved responsive behavior so toggles remain usable and visually consistent.
  - `styles/responsive.css`:
    - <=900px: topbar becomes stacked, toggles stay a 4-column full-width bar
    - <=760px and <=480px: toggles switch to a 2x2 segmented layout with balanced sizing
    - workspace control buttons align cleanly beneath the toggle bar

### Table View Spreadsheet-Style Grid Editing (Modular)
- Rebuilt table interactions to behave like a spreadsheet editor with modular render internals.
  - Added modular table engine files:
    - `src/render/table/schema.js` (typed column config + parse/format)
    - `src/render/table/metrics.js` (readiness + sorted row shaping)
    - `src/render/table/gridState.js` (active/anchor/selection math)
    - `src/render/table/clipboard.js` (TSV copy/paste matrix helpers)
    - `src/render/table/dom.js` (cell lookup + selection class application)
    - `src/render/table/editing.js` (inline editors for text/date/select)
    - `src/render/table.js` (orchestration + events)
- New table behavior:
  - click/shift-click/drag multi-cell selection
  - keyboard navigation with arrows + Tab
  - spreadsheet-style copy/paste ranges (TSV)
  - inline typed editing via Enter or double-click
- Wired safe save pipeline:
  - `src/main.js` now receives `onCellUpdate` / `onBatchCellUpdate` callbacks,
  - applies status/workspace guardrails before persistence,
  - enforces per-row edit permission checks with user feedback.
- Added spreadsheet visual states in `styles/views.css`:
  - active cell, selected range, readonly cells, and inline editor styling.
- Improved dropdown editing intelligence for typed/pasted values:
  - `src/render/table/schema.js`: workspace select now supports exact-id, exact-name, unique prefix, and unique contains matching; ambiguous/invalid values safely fall back to current row workspace.
  - `src/render/table/schema.js`: status select now supports aliases (`draft`, `inprogress`, `inreview`, etc.), normalized label matching, and safe fallback to existing row status.
  - `src/render/table.js`: edit and paste parsing now pass row context into value parsing so fallbacks stay row-correct.

### Table View Hover-Reveal New Rows Action
- Refined table row import entry UX to be more cohesive and lightweight.
  - `index.html`: renamed action to `+ New Rows` and clarified title text for click-then-paste flow.
  - `styles/views.css`: made the action hover/focus-reveal in the Rows section header.
  - Preserved accessibility via `:focus-within` behavior and added touch fallback (`@media (hover: none)`) so the control stays visible on non-hover devices.


### Table View Spreadsheet Paste Import
- Added a table-native bulk import flow for clipboard data from Google Sheets/Airtable/Excel.
  - `index.html`: added `Paste Rows` action in the Rows section + dedicated paste dialog.
  - `styles/views.css`: added dialog/textarea/result styling for bulk paste UX.
  - `src/main.js`:
    - added robust row parsing for tab/comma clipboard formats,
    - header/positional column mapping (`title`, `workspace`, `status`, `platforms`, `assignee`, `scheduleDate`, `caption`, `tags`, `visibility`),
    - normalization + validation (status/workspace/date/tags/platforms),
    - import summary feedback with created/skipped row counts.
  - `src/store.js`: added `bulkCreatePosts(rows)` with permission checks, per-row validation, optimistic state updates, and rollback on failed persistence.

### Table View Selection + Spreadsheet Copy/Paste
- Made table rows and cells reliably selectable for normal text highlighting/copy workflows.
  - `src/render/table.js`: replaced title button cell with plain text span to avoid selection friction.
  - `styles/views.css`: enforced `user-select: text` across table wrapper/cells/title text and tuned cursor behavior.
- Preserved post-open UX while prioritizing selection intent.
  - `src/render/table.js`: row click now opens post only when no text is currently selected and click is not on an interactive control.
- Added spreadsheet-friendly copy normalization.
  - `src/render/table.js`: scoped table `copy` handler now emits tab-separated values (TSV) for selected table cells so paste into Google Sheets/Excel maps cleanly to columns/rows.

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
