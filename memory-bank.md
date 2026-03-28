## 🔨 Projects

### Soci — Social Content Planning App (Starter)
- **Objective:** Turn the current UI prototype into a fully functional, non-breaking social planning application.
- **Primary Goal:** Support end-to-end planning workflows for social features (content lifecycle, scheduling, collaboration, publishing readiness, and performance insights).
- **Current State (Implemented):** Modular browser app with persistent local data and working social-planning flows.
- **Success Criteria (Assumed):**
  - Users can create/edit/manage social content reliably.
  - Calendar and Kanban stay in sync with persisted data.
  - Core social planning features are available without regressions.

### Implementation Snapshot (2026-03-15)
- Delivered a modular local-first app structure:
  - `index.html` (shell/layout)
  - `styles.css` (UI styling)
  - `src/data.js` (schema + seed data)
  - `src/store.js` (localStorage-backed state store)
  - `src/render.js` (kanban/calendar/inspector rendering)
  - `src/main.js` (app wiring and interaction rules)
- Core working features:
  - Kanban by status (`idea`, `in-progress`, `in-review`, `ready`)
  - Drag-and-drop status movement with business rules
  - Calendar schedule view linked to posts
  - Inspector editor for title/status/date/platforms/tags/caption
  - Collaboration fields (assignee, reviewer, comments)
  - Publish readiness checklist + approval gate for `ready`
  - Platform variant planning via JSON field
  - Persistent data via `localStorage` (`soci.posts.v1`)

### Implementation Snapshot Addendum (2026-03-15)
- Added profile-accuracy and feed-forecasting foundation for authentic profile planning:
  - Canonical publish fields in post model:
    - `publishState` (`published | scheduled | draft`)
    - `publishedAt`, `scheduledAt`
    - `postType`
  - Store-level truth-first utilities:
    - `sortByProfileOrder(posts)` for deterministic profile ordering
    - `profileIntegrity(posts)` for metadata validation messaging
    - normalization/migration defaults for legacy localStorage records
  - New mock profile simulator (inside existing Grid Preview view):
    - Instagram profile mode
    - TikTok profile mode
    - Current profile section (published-only)
    - Projected top-9 section (future + current merge)
    - integrity status pill for profile confidence
  - Added in-app Accuracy Audit panel in profile simulator:
    - Validates published timestamp presence
    - Flags future-dated published timestamps
    - Flags scheduled posts missing schedule metadata
    - Detects duplicate post IDs
    - Confirms platform-eligible post presence per active profile mode
    - Shows per-check severity (`ok | warning | error`)

### Implementation Snapshot Addendum 2 (2026-03-15)
- Added non-breaking workflow and integrity UX upgrades:
  - Filter/search bar in main workspace:
    - text query (title/caption/tags)
    - platform filter
    - status filter
    - dynamic assignee filter
  - Cross-view consistency:
    - filtered dataset now drives Kanban, Calendar, and Grid/Profile views
  - Inspector integrity improvements:
    - inline form error panel replaces silent failures
    - explicit publish metadata fields (`publishState`, `publishedAt`, `scheduledAt`, `postType`)
    - JSON variants parse validation with visible errors
    - readiness rule validation before save
  - Profile audit recovery UX:
    - `Fix now` actions on actionable audit checks
    - selecting a fix target opens the post in inspector and returns to Kanban
  - Keyboard speedups:
    - `Cmd/Ctrl + N` creates a new post
    - `Cmd/Ctrl + S` saves current inspector form
  - Stats UX update:
    - topbar now shows visible/total post counts after filtering

### Implementation Snapshot Addendum 3 (2026-03-24)
- Added multi-client calendar management and sharing foundation:
  - Client entity support in data/store:
    - `clients` collection with `id`, `name`, `shareSlug`, `sharingEnabled`, `channels`
    - active client persistence via localStorage (`soci.activeClientId.v1`)
    - post-level ownership and sharing fields:
      - `clientId`
      - `visibility` (`client-shareable | internal`)
  - UI controls for client operations in filter bar:
    - active client selector
    - quick add client button
    - copy share link action
    - export CSV action
    - export ICS action
  - Inspector updates:
    - assign post to client
    - set visibility (client-shareable/internal)
    - enforce client assignment on save
  - Workflow enforcement updates:
    - status movement and save paths now block progression when client is missing
  - Client sharing mode:
    - hash route format: `#share=<client-slug>`
    - read-only, privacy-safe calendar rendering
    - hides internal workspace chrome in share mode
    - only includes `client-shareable` posts with schedule dates
  - Calendar export:
    - CSV export for selected client schedule
    - ICS export for selected client schedule
    - excludes internal-only posts

### Implementation Snapshot Addendum 4 (2026-03-25)
- Upgraded workspace UX to support multi-panel planning and collapsible layout controls:
  - Replaced exclusive tabs with additive view toggles:
    - Workflow (Kanban) on/off
    - Schedule (Calendar) on/off
    - Preview (Grid/Profile) on/off
  - Added independent collapsible sections:
    - Workflow section collapse/expand
    - Schedule section collapse/expand
    - Preview section collapse/expand
    - Inspector panel collapse/expand
  - Added persistence of UI state via localStorage:
    - `soci.ui.views.v1`
    - `soci.ui.sections.v1`
  - Enforced guardrail that at least one view remains visible.
  - Preserved existing business logic and interactions:
    - client assignment/status gating rules
    - inspector save/comment/delete/duplicate flows
    - client share link and CSV/ICS export behavior
  - Share route behavior remains privacy-safe and now forces calendar-first layout presentation.
- Refined action hierarchy:
  - Moved `+ New Post`, `+ Client`, `Share Link`, `CSV`, `ICS` into topbar action cluster.
  - Kept filterbar focused on filtering only.
- Applied visual refresh toward modern glassmorphism styling:
  - translucent layered panels, blur surfaces, gradient backdrop, soft depth tokens
  - improved button/toggle affordance and interaction motion
  - responsive improvements for tablet/mobile stacking and actionbar behavior

### Implementation Snapshot Addendum 5 (2026-03-25)
- Advanced workspace shell and inspector UX refinements for client calendar operations:
  - Added full left/right sidebar collapse model with persisted UI state:
    - `leftSidebar` and `rightSidebar` flags in `soci.ui.sections.v1`
    - body layout classes: `left-collapsed`, `right-collapsed`, `both-collapsed`
    - explicit reopen controls for collapsed sidebars
  - Updated workspace layout behavior:
    - center workspace now expands dynamically when one or both sidebars collapse
    - responsive grid templates adapt for full-width planning mode
  - Refined inspector information architecture (non-breaking field retention):
    - New top “Post Preview” card scaffold
    - Reordered sections into:
      - `Caption & Content`
      - `Settings & Specifics`
      - `Collaboration`
      - `Publish Readiness`
      - `Comments`
    - Preserved all existing save payload fields and workflow validation rules
  - Styling updates for new layout controls and preview treatment:
    - sidebar header/action grouping primitives
    - new `workspace-controls` naming alignment in topbar
    - preview card + media placeholder styles for modern post-edit flow

### Implementation Snapshot Addendum 6 (2026-03-25)
- Introduced Phase 1 VPS-ready backend scaffold (zero-dependency Node HTTP API):
  - Added backend module structure:
    - `backend/config.js` (env-driven runtime config)
    - `backend/utils.js` (HTTP/json helpers, id/time utilities)
    - `backend/auth.js` (HMAC-signed token creation/verification)
    - `backend/db.js` (file-backed persistence and CRUD helpers)
    - `backend/server.js` (API routes + upload serving)
  - Added root `package.json` API script:
    - `npm run api` → starts `backend/server.js`
  - Persistence model for Phase 1:
    - JSON DB file at `backend/data/db.json`
    - Upload storage directory at `backend/uploads/`
    - Records: `clients`, `posts`, `media`, `shareLinks`
  - Admin authentication scaffold:
    - Login endpoint: `POST /api/auth/login`
    - Signed bearer tokens for admin-protected endpoints
  - Admin API endpoints:
    - `GET /api/admin/state`
    - `POST /api/admin/clients`
    - `POST /api/admin/posts`
    - `POST /api/admin/media` (base64 payload to file + DB link)
    - `POST /api/admin/share-links`
  - Client access endpoint:
    - `GET /api/share/:token/calendar` (read-only client-safe post payload)
  - Ops endpoint:
    - `GET /health`
  - Static file serving from API for uploaded media:
    - `GET /uploads/:file`

### Implementation Snapshot Addendum 7 (2026-03-25)
- Implemented Phase 2 frontend-to-backend integration for admin workflows and client sharing:
  - Added `src/api.js` for centralized API transport:
    - auth login/token persistence
    - admin state load
    - client/post upsert
    - share link creation
    - share-calendar fetch
    - media upload (file → base64 transport)
  - Migrated `src/store.js` persistence from localStorage to backend API sync:
    - bootstraps from `GET /api/admin/state`
    - async sync on create/update for clients and posts
    - added in-memory `media` collection in store state
    - added `uploadPostMedia(postId, file)` store action
    - added `createClientShareLink(clientId)` and `loadShareCalendar(token)` actions
  - Updated `src/main.js` app flow:
    - bootstrap-aware loading states (`isBootstrapped` guard)
    - share route now token-oriented (`#share=<token>`)
    - async share-token fetch from backend endpoint with loading/error handling
    - copy share-link action now requests backend-issued token URL first (falls back to slug hash)
    - inspector now receives media data and upload handler
  - Updated `src/render.js` inspector UI:
    - media file input (`accept=image/*,video/*`)
    - upload status feedback
    - linked media list render
    - preview card now reflects first attached media link
  - Updated `src/data.js` schema defaults:
    - added `mediaIds: []` in seed posts and empty post factory

### Implementation Snapshot Addendum 8 (2026-03-25)
- Added MVP deployment and production-hardening artifacts for Vercel + Hostinger + Cloudflare rollout:
  - Backend hardening updates:
    - `backend/config.js`
      - `CORS_ORIGINS` support (comma-separated allowlist)
      - `MAX_JSON_BYTES` + `MAX_UPLOAD_BYTES` limits
    - `backend/utils.js`
      - bounded JSON body parser support with payload-size checks
      - `pickCorsOrigin()` helper for strict origin selection
    - `backend/server.js`
      - replaced wildcard CORS with origin allowlist handling
      - standardized `OPTIONS` behavior
      - added request size enforcement for login/admin/media/share-link endpoints
      - returns `413 Payload too large` when limits are exceeded
  - Deployment documentation added:
    - `.env.example` with required prod env vars and safe defaults
    - `DEPLOYMENT.md` concrete runbook for:
      - Hostinger VPS setup (Node, PM2, Nginx)
      - Vercel static frontend deploy
      - Cloudflare DNS + SSL configuration
      - smoke-check flow
  - Backup operations scaffold added:
    - `scripts/backup.sh`
      - archives `backend/data/db.json` + `backend/uploads`
      - rotates backups, keeping latest 7
      - script marked executable

## ⚙️ Areas

### Product Area: Social Planning Workflow
- Content ideation → drafting → review → ready → scheduled/published.
- Post metadata management (platforms, tags, status, publish date).

### Engineering Area: Stability & Incremental Delivery
- Preserve existing UI behavior while introducing real state/data layers.
- Use phased rollout and verification per feature slice.
- Keep modules small and composable.

### Validation Area
- Browser run verified on local static server (`python3 -m http.server 4174 ...`).
- App assets loaded successfully and no runtime console errors were observed during smoke checks.
- New profile simulator UI flow was visually verified in browser:
  - Grid Preview tab renders Profile Feed Simulator view
  - Instagram/TikTok mode switch buttons render and toggle
  - Current + projected profile sections render with expected structure
- Accuracy audit panel validation was verified in browser:
  - Grid Preview includes audit card with multi-check results
  - Profile sections now use active-platform eligible posts for accuracy
  - No runtime console errors observed (except expected favicon 404 from static server)
- Additional validation pass:
  - JS syntax check passes for `src/main.js`, `src/render.js`, `src/store.js` via `node --check`
  - Filter controls render and update visible dataset without console errors
  - Inspector inline validation and audit `Fix now` controls render in UI
- Multi-client/share validation pass (2026-03-24):
  - JS syntax check passes for:
    - `src/main.js`
    - `src/render.js`
    - `src/store.js`
    - `src/data.js`
  - Browser verification:
    - main workspace loads with new client controls in top filter bar
    - share route `#share=acme-coffee` renders read-only shared calendar mode
    - expected favicon 404 only; no runtime JS errors observed
- Multi-view/collapse UI validation pass (2026-03-25):
  - JS syntax checks pass for `src/main.js`, `src/render.js`, `src/store.js`, `src/data.js`
  - Browser verification on local server confirms:
    - Workflow and Schedule sections collapse/expand correctly
    - Preview view can be toggled on and off independently
    - additive multi-view behavior is active (non-exclusive)
    - actionbar controls render in topbar and filterbar remains filter-only
    - expected favicon 404 only; no runtime JS errors observed
- Sidebar/inspector refinement validation pass (2026-03-25):
  - JS syntax checks pass for:
    - `src/main.js`
    - `src/render.js`
    - `src/store.js`
    - `src/data.js`
  - Browser verification on local server confirms:
    - app loads with no runtime JS errors (favicon 404 expected)
    - left and right collapse controls respond and persist layout changes
    - workspace width adapts when sidebars are collapsed
    - inspector renders reordered “Post Preview → Content → Settings” flow
- Backend scaffold validation pass (2026-03-25):
  - Syntax checks pass for:
    - `backend/server.js`
    - `backend/db.js`
    - `backend/auth.js`
    - `backend/config.js`
    - `backend/utils.js`
  - Runtime checks pass:
    - API boot confirms listening on `http://localhost:8787`
    - `GET /health` returns `{ ok: true }`
    - admin login returns signed bearer token
    - authenticated client creation endpoint succeeds
- Frontend integration validation pass (2026-03-25):
  - JS syntax checks pass for:
    - `src/api.js`
    - `src/store.js`
    - `src/main.js`
    - `src/render.js`
    - `src/data.js`
  - Runtime checks:
    - static frontend serves from local HTTP server on `:4174`
    - backend API listening on `:8787`
    - browser load succeeds with no blocking runtime errors
    - expected favicon 404 only
- Deployment-hardening validation pass (2026-03-25):
  - JS syntax checks pass for:
    - `backend/config.js`
    - `backend/utils.js`
    - `backend/server.js`
    - `src/api.js`
    - `src/store.js`
    - `src/main.js`
    - `src/render.js`
  - Ops validation:
    - backup script executable bit set for `scripts/backup.sh`

### Implementation Snapshot Addendum 9 (2026-03-26)
- Fixed persistence regression and accessibility labeling issues discovered during API-backed editing:
  - Persistence fix:
    - aligned backend post status validation with frontend workflow statuses
    - `backend/server.js` now accepts `in-progress` and `in-review` statuses (while retaining legacy values for compatibility)
  - Accessibility fix:
    - updated inspector form labels in `src/render.js` so form controls use explicit `label for` ↔ `id` associations
    - converted non-form-heading labels (platform section headings) to non-label text elements to avoid false violations
  - Verification:
    - syntax checks pass for edited files
    - direct API post upsert with status `in-progress` now persists successfully

### Implementation Snapshot Addendum 10 (2026-03-26)
- Refined inspector information hierarchy and validated media flow reliability:
  - Inspector sidebar/order update in `src/render.js`:
    - reordered content to: `Title` → `Media Upload` → `Caption` → `Platform Captions` → `Settings & Specifics`
    - moved platform toggles and tags into `Settings & Specifics` grouping for clearer progressive editing flow
  - Media UX/compatibility update:
    - expanded upload input accept list to include `application/pdf` to match backend-allowed media types
  - Verification:
    - API-level upload test confirms media is created and linked to post (`upload_ok: true`, `linked_ok: true`)
    - returned upload path is valid (`/uploads/...`)
    - syntax checks pass for `src/render.js` and `src/main.js`
    - source scan confirms no unlabeled `<label>` usage remains in `src/*.js`

### Implementation Snapshot Addendum 11 (2026-03-26)
- Added production-resilience fixes for API sync failures and stale API base configuration:
  - `src/api.js`
    - added API base normalization to prevent malformed persisted base URLs
    - strips trailing slashes and legacy `/api` suffix in stored `soci.api.base`
  - `src/store.js`
    - introduced centralized sync error reporting hook (`setErrorHandler`)
    - wrapped async server sync operations to report actionable failures (save/delete/share/upload)
  - `src/main.js`
    - wired store sync errors to UI toast notifications so failed persistence is no longer silent
  - Production diagnostics captured:
    - deployment workflow for commit `d8a1357` succeeded
    - live frontend serves updated inspector code
    - live API health and CORS preflight for `/api/admin/media` and `/api/admin/posts` respond correctly

### Implementation Snapshot Addendum 12 (2026-03-26)
- Captured latest production deployment/debug cycle and resilience follow-through:
  - New production fix commit pushed: `4daba69` (`Fix prod API base normalization and surface sync failures in UI`)
  - Root-cause mitigation documented:
    - stale persisted `soci.api.base` values (legacy `/api` suffix forms) could produce invalid API targets
  - Frontend hardening shipped:
    - `src/api.js`: `normalizeApiBase()` trims trailing slashes and strips legacy `/api` suffix
    - `src/store.js`: centralized sync error reporting hook (`setErrorHandler`)
    - `src/main.js`: sync failures surfaced via toast notifications (prevents silent save/upload failures)
  - CI/CD incident + recovery:
    - initial `Deploy to VPS` run failed with SSH timeout (`dial tcp ***:22: i/o timeout`)
    - rerun succeeded for the same commit after connectivity recovery
  - Live verification notes:
    - production frontend confirms normalized API-base code is deployed
    - latest deploy workflow status recovered to success

## 📚 Resources

### Known Inputs
- `inspo.md` contains a React component prototype with:
  - Kanban board
  - Calendar view
  - Inspector/editor and preview panel
  - Mock posts and mock interactions

### Constraints & Assumptions
- **Assumption:** No backend/database/auth currently exists in this folder.
- **Assumption:** This repo is at planning/bootstrap stage.
- **Assumption:** Initial implementation should prioritize zero-cost/open-source tooling.
- **Assumption:** Existing visual/interaction behavior should remain intact during refactor.

### Runtime Notes
- Current architecture is intentionally local-first and zero-cost.
- Data can be evolved later into API/DB persistence behind the same store/repository contract.

## 📥 Archives

- None yet.
- Future: Move deprecated decisions, old schema versions, and retired implementation plans here.

---

## Assumption Log (For User Review)
1. App is currently a prototype rather than production-ready.
2. Feature priority is social planning workflows over advanced analytics/AI initially.
3. Regression safety is a top requirement (incremental migration, not rewrite).
4. We should avoid adding unnecessary files and only modularize where critical.

---

### Implementation Snapshot Addendum 13 (2026-03-26)
- Fixed save-persistence bug and modularized backend for maintainability:
  - Root-cause fix — seed data sync (`src/store.js`):
    - when backend returns no clients (empty volume), frontend fell back to seed data with new UUIDs, discarding any saved posts
    - seed clients/posts are now synced to backend immediately on first bootstrap
    - prevents browser refresh from discarding saved changes via seed-data re-initialization
  - Root-cause fix — atomic read-modify-write (`backend/db.js`):
    - replaced write-only queue with `enqueue()` wrapping the full `loadState → modify → saveState`
    - concurrent saves no longer read stale state and overwrite each other
    - `saveState` is now internal; all write operations go through `enqueue`
  - Backend modularized from 342-line monolith into focused modules:
    - `backend/router.js` — minimal zero-dependency route matcher with `:param` support
    - `backend/validators.js` — `validateClient()` and `validatePost()` extracted and exported
    - `backend/routes/health.js` — `GET /health`
    - `backend/routes/auth.js` — `POST /api/auth/login` + rate limiting
    - `backend/routes/admin.js` — all `/api/admin/*` endpoints + media upload error handling fixed
    - `backend/routes/share.js` — `GET /api/share/calendar`
    - `backend/routes/uploads.js` — `GET /uploads/:filename`
    - `backend/server.js` — reduced to ~55-line entry point (CORS, security headers, dispatch)
  - Additional fixes:
    - media write errors (`mkdir`/`writeFile`) now return 500 instead of silently failing
    - `validateFilePath()` helper added to `backend/utils.js` — deduplicates path traversal check
  - Verification:
    - `GET /health`, `POST /api/auth/login`, `POST /api/admin/clients`, `POST /api/admin/posts` smoke-tested locally
    - commit `cf7407c` pushed to `main`, auto-deploy triggered to VPS

### Implementation Snapshot Addendum 14 (2026-03-26)
- Diagnosed and fixed media upload reliability issues causing "finnicky" behavior in MVP flows:
  - Root-cause alignment (frontend vs backend constraints):
    - frontend now validates upload MIME types against backend-allowed set before upload
    - frontend now enforces conservative binary size ceiling (~9MB) to account for base64+JSON overhead under `MAX_UPLOAD_BYTES`
  - `src/render.js` upload UX hardening:
    - restricted file input `accept` list to supported media types/extensions only
    - added explicit user-facing validation messages for unsupported types and oversized files
    - added inline byte-format helper for clearer error messaging
  - `src/render.js` preview reliability upgrade:
    - primary media preview now renders as true inline media (`<img>` / `<video controls>`) when possible
    - graceful anchor fallback retained for PDFs/other non-inline cases
  - `backend/routes/admin.js` validation resilience:
    - refined magic-byte checks to be MIME-specific (length guards per format)
    - improved file mismatch/corruption error messaging for easier debugging
  - `backend/routes/uploads.js` serving correctness:
    - now returns extension-based `Content-Type` for known media types
    - returns `Content-Disposition: inline` for image/video/pdf to support in-app preview
    - retains attachment fallback for unknown binary types
  - Verification status:
    - syntax checks pass for `src/render.js`, `backend/routes/admin.js`, `backend/routes/uploads.js`
    - runtime API boot check blocked locally by secure startup guard (missing non-default `AUTH_SECRET`/`ADMIN_PASSWORD` in environment), not by new code changes

### Implementation Snapshot Addendum 15 (2026-03-26)
- Fixed production media preview 404 caused by relative upload URL resolution on frontend host:
  - Root cause:
    - backend stores media links as relative `urlPath` (`/uploads/<uuid>.<ext>`)
    - frontend rendered that path directly, so browser resolved to `https://soci.hommemade.xyz/uploads/...` instead of API host
  - `src/api.js`:
    - added `resolveApiUrl(urlPath)` helper to normalize media paths into absolute API URLs
    - preserves already-absolute URLs and safely prefixes relative paths with resolved API base
  - `src/store.js`:
    - added `normalizeMediaRecord()` to normalize `urlPath`/`publicUrl` at data ingress
    - applies normalization during bootstrap (`GET /api/admin/state`) and immediate upload merge (`uploadPostMedia`)
  - Outcome:
    - existing and newly uploaded media now resolve against API origin consistently, preventing frontend-origin `/uploads` 404s
    - accessibility behavior remains correct (`<img>` keeps role=image and alt text)
  - Verification:
    - syntax checks pass for `src/api.js`, `src/store.js`, `src/render.js`

### Implementation Snapshot Addendum 16 (2026-03-26)
- Added media delivery/download controls and storage cleanup improvements for MVP stability:
  - `backend/routes/uploads.js`:
    - added query-driven original download mode: `?download=1`
    - inline preview remains default for renderable media (image/video/pdf)
    - forced attachment with filename when download mode is requested
    - added long-lived immutable cache header for static uploaded media
  - `src/render.js`:
    - added explicit "Download original" links for each media item (uses `?download=1`)
    - kept inline preview behavior and added image `loading="lazy"` + `decoding="async"` hints for lighter preview bandwidth usage
  - `backend/db.js` cleanup hardening:
    - post/client delete operations now perform best-effort disk cleanup for associated media files after DB save
    - prevents orphaned upload files from accumulating in `UPLOAD_DIR`
  - Verification:
    - syntax checks pass for `backend/routes/uploads.js`, `backend/db.js`, `src/render.js`

### Implementation Snapshot Addendum 17 (2026-03-26)
- Delivered Gen Z-forward visual/system UX refresh with solarized dual-mode palette and inspector modernization:
  - Global visual language (`styles.css`):
    - introduced tokenized **off-white light mode** + **obsidian dark mode** palette via `:root` + `@media (prefers-color-scheme: dark)`
    - shifted from harsh strokes/white surfaces to layered surface tokens, softer contrast lines, and depth-driven separation
    - refreshed typography stack to `"Plus Jakarta Sans", Inter, system-ui`
    - applied larger squircle radii and gradient accent treatment for CTAs/active states
  - Layout hierarchy (`index.html` + `styles.css`):
    - moved view toggles to topbar and relabeled to `Kanban | Calendar | Grid`
    - refined left sidebar into lighter action rail style while keeping existing action semantics
  - Inspector IA + social UX (`src/render.js`):
    - restructured long-form inspector into tabs: `Content | Settings | Collaboration`
    - added sticky inspector action bar for persistent save/duplicate/delete affordance
    - added media-first drag-and-drop upload zone while preserving hidden file input fallback
    - upgraded post preview card to larger social-style frame with lightweight engagement overlays
    - added visual readiness bar (`Post readiness: X%`) based on existing checklist model
    - caption editor now auto-expands for frictionless writing
    - added hashtag suggestion chips with usage counts and one-click insertion into tags/caption
  - Suggestion data flow (`src/main.js`):
    - added `collectHashtagSuggestions(posts)` across tags + caption hashtags
    - wired suggestions into `renderInspector` handlers without backend/schema changes
  - Validation pass:
    - syntax checks pass for `src/render.js` and `src/main.js` via `node --check`
    - browser verification pass confirms:
      - new topbar view-toggle placement and styling
      - updated sidebar visual hierarchy
      - inspector tab segmentation and sticky action row
      - drag/drop media affordance and readiness meter visibility
      - no new runtime console errors observed during smoke interactions

### Implementation Snapshot Addendum 18 (2026-03-26)
- Completed comprehensive theme coverage and manual light/dark control:
  - `styles.css`
    - added explicit manual theme token layers via `:root[data-theme="light"]` and `:root[data-theme="dark"]`
    - preserved system fallback with `@media (prefers-color-scheme: dark)` only when no manual `data-theme` override is set
    - replaced remaining hardcoded light surfaces in planning UI with semantic tokens across:
      - kanban columns/cards/chips
      - calendar day cells/chips/nav controls
      - preview/profile panels and tiles
      - inspector/comment/action secondary surfaces
  - `index.html`
    - added topbar theme toggle control (`#theme-toggle`)
  - `src/main.js`
    - added persistent theme preference key: `soci.theme.v1`
    - implemented `applyTheme()` + `toggleTheme()` to set/remove `data-theme` on `<html>`
    - toggle button label/aria now reflects next mode (`☀️ Light` / `🌙 Dark`)
  - Validation:
    - syntax checks pass for `src/main.js` and `src/render.js`
    - browser verification confirms visible mode switching and non-white kanban/calendar surfaces in dark mode

### Implementation Snapshot Addendum 19 (2026-03-26)
- Added localhost preview bypass so design work is viewable without auth-blocking login screen:
  - `src/main.js`
    - introduced guarded local bypass condition:
      - enabled only for `localhost` / `127.0.0.1`
      - disabled for share links (`#share=` still behaves as designed)
    - app now auto-opens workspace locally for quick visual QA while preserving normal login behavior on non-local hosts
  - Validation:
    - browser verification confirms `http://localhost:4174/index.html` loads directly into app shell (no login blocker)
    - existing theme toggle + kanban/calendar styling remain intact during local preview

### Implementation Snapshot Addendum 20 (2026-03-26)
- Began non-breaking coworking access rollout with additive multi-user auth and membership controls:
  - Backend auth/security foundation:
    - `backend/auth.js`
      - added password hashing + verification helpers using Node `crypto.scrypt` (`hashPassword`, `verifyPassword`)
    - `backend/routes/auth.js`
      - login now supports DB-backed users first (owner/helper/client roles)
      - retains backward-compatible env-admin fallback login path
      - normalized login response now includes `user` metadata with role
  - Data model expansion (additive, backward-compatible):
    - `backend/db.js`
      - added collections: `users`, `memberships`, `activity`
      - added state shape normalization for legacy DB compatibility
      - seeded default `owner-admin` user from env credentials when no users exist
      - added user/membership helpers: `findUserByEmail`, `upsertUser`, `upsertMembership`
      - added coworking comment activity write helper: `addPostComment`
  - Admin API expansion (without removing existing routes):
    - `backend/routes/admin.js`
      - broadened admin gate to accept `owner_admin` and legacy `admin`
      - added `POST /api/admin/users` to create/update helper/client users
      - added `POST /api/admin/memberships` to assign users to clients with permissions
  - Coworking scoped endpoints (additive):
    - new `backend/routes/me.js`
      - `GET /api/me/state` returns role-scoped state (admin = full, helper/client = membership-filtered)
      - `POST /api/me/posts/:postId/comments` enforces permission-aware comments (`comment/edit/manage`)
    - `backend/server.js` now registers `registerMeRoutes`
  - Validation and input hardening:
    - `backend/validators.js`
      - added `validateUser`, `validateMembership`, `validateComment`
  - Frontend compatibility update:
    - `src/api.js`
      - added auth-user persistence key `soci.auth.user`
      - `login()` now stores returned user profile metadata
      - `setAuthToken(null)` clears both token and stored auth user
  - Verification pass:
    - syntax checks passed for modified backend/frontend modules via `node --check`
    - end-to-end API smoke test passed for:
      - owner login (`role=owner_admin`)
      - client creation + post creation
      - helper user creation
      - membership assignment
      - helper login
      - scoped `/api/me/state` visibility (`me_clients=1`)
      - helper comment creation via `/api/me/posts/:postId/comments`

### Implementation Snapshot Addendum 21 (2026-03-26)
- Added practical in-app user management flow for admin users:
  - `index.html`
    - added sidebar action button: `Manage Users`
  - `src/api.js`
    - added admin user-management client methods:
      - `createUser(token, payload)` → `POST /api/admin/users`
      - `assignMembership(token, payload)` → `POST /api/admin/memberships`
      - `getMyState(token)` → `GET /api/me/state`
  - `src/store.js`
    - role-aware bootstrap:
      - admin roles use `GET /api/admin/state`
      - helper/client roles use `GET /api/me/state`
    - added auth user accessor: `getCurrentUser()`
    - added admin helpers:
      - `adminCreateUser(payload)`
      - `adminAssignMembership(payload)`
  - `src/main.js`
    - added admin-only `Manage Users` action visibility (`owner_admin`/`admin` roles)
    - implemented guided prompt workflow:
      - create helper/client user (email/name/role/password)
      - optionally assign membership to a selected client with permissions
    - integrated toast feedback and existing error handling for safer operation
  - Verification:
    - syntax checks pass for `src/main.js`, `src/store.js`, `src/api.js`
    - browser smoke launch confirms updated app shell loads with new management control path

### Implementation Snapshot Addendum 22 (2026-03-26)
- Added explicit admin-role promotion safeguard for `zac@hommemade.xyz`:
  - `backend/db.js`
    - introduced `ALWAYS_ADMIN_EMAILS` set including `zac@hommemade.xyz`
    - added `applyRolePromotions(state)` during state normalization so matching accounts are forced to `owner_admin`
    - promotion is non-destructive (does not change password), updates only role + `updatedAt`
  - Verification:
    - syntax check passes for `backend/db.js`
    - login test with a pre-existing `helper_staff` record for `zac@hommemade.xyz` confirms role is promoted to `owner_admin` at auth time

### Implementation Snapshot Addendum 23 (2026-03-26)
- Completed visual + admin UX refresh requested for Soci brand direction:
  - `styles.css`
    - replaced remaining purple/pink accents with wasabi/ginger-forward accents
    - updated scheduled badges and platform accent rings to warm/green palette
    - aligned login focus, labels, placeholders, and gradient accents with wasabi/ginger color system
    - retained responsive typography scale tokens (`--fs-*`) and applied them across controls/text for consistent sizing behavior
  - `index.html` + `src/main.js`
    - confirmed Manage Users now uses inline panel UI with dropdown controls and form fields (no browser popups)
    - admin creation/membership flow now operates through in-app fields: role selector + client selector + permission toggles
  - Validation:
    - source scan confirms no `prompt()` / `confirm()` usage in `src/main.js`
    - syntax checks pass for `src/main.js` and `src/render.js`
    - browser launch validation completed; interactive click-step verification was partially blocked by Puppeteer screenshot timeout on click action

### Implementation Snapshot Addendum 24 (2026-03-26)
- Replaced emoji UI affordances with icon-library components and aligned accent controls to branded glassmorphism:
  - Icon library integration:
    - `index.html` now loads Lucide via CDN (`unpkg`) and initializes icon placeholders in topbar controls
    - replaced topbar reopen controls (`Menu`, `Details`) and theme toggle iconography with Lucide icons
  - Theme toggle rendering update (`src/main.js`):
    - removed emoji-based text labels
    - `applyTheme()` now renders icon + text (`sun` / `moon`) and refreshes icons safely
    - added `refreshIcons()` helper and invoked after paint cycles to support dynamic render updates
  - Inspector social preview icon update (`src/render.js`):
    - replaced emoji pills with Lucide-based pills (`heart`, `message-circle`, `send`)
    - added icon helper + icon refresh call after inspector render
  - Glassmorphism visual pass (`styles.css`):
    - applied layered glass gradients, soft highlight borders, blur + depth shadows to accent-color controls
    - covered accent controls including:
      - active view tabs and primary/save/add buttons
      - active profile mode buttons (`.small.active`)
      - active platform chips (`.platform-toggle.active`)
      - inspector active tabs
    - extended branded glass treatment to tag/chip surfaces:
      - hashtag chips (`.hashtag-chip`)
      - calendar chips (`.chip`)
      - social pills (`.social-pill`)
      - scheduled/published card badges
  - Validation:
    - source scan confirms targeted emoji symbols removed from `index.html`, `src/main.js`, `src/render.js`, `styles.css`
    - syntax checks pass for `src/main.js` and `src/render.js`
    - browser launch check completed on local server (`http://localhost:4174/index.html`)

### Implementation Snapshot Addendum 25 (2026-03-26)
- Refined dark mode to be a neutral tonal counterpart of light mode (reduced green cast) and tightened full surface mapping for cards/boxes, including grid/profile views:
  - Dark token rebalance in `styles.css`:
    - updated dark palette from olive-heavy to charcoal/slate foundations while preserving brand accents for interactive states
    - applied the same neutralized token set to both manual dark mode and prefers-color-scheme fallback
  - Surface/card/box consistency updates:
    - ensured grid/profile containers and cards inherit semantic tokens (`--surface-soft`, `--surface-raised`, `--line`)
    - refreshed platform preview card rings (`.platform-ig/.platform-tt/.platform-li/.platform-x`) to token-based color-mix values
    - replaced hardcoded preview frame border with token-based dashed border for better dark fidelity
    - normalized profile/audit state surfaces (`.integrity.*`, `.audit-panel li.*`) to token-aware color-mix values
    - adjusted tile typography and state badge tones (`.tile-thumb`, `.card-badge.published`, `.card-badge.scheduled`) for balanced dark contrast
    - removed residual hardcoded light hover/background values in secondary actions and danger controls
  - Login visual parity pass:
    - shifted login backdrop and panel shadow to neutral dusk tones to align with the revised dark system
    - updated login labels/placeholders/focus ring to cooler neutral accents
  - Validation:
    - browser launch check completed on local server (`http://localhost:4174/index.html`)
    - no runtime errors observed during launch check

### Implementation Snapshot Addendum 26 (2026-03-26)
- Upgraded Grid Preview profile simulator into platform-authentic mock feed previews based on provided Instagram/TikTok inspo:
  - `src/render.js`
    - profile simulator now renders mock social-profile shells with:
      - social-style header (`handle`, profile name, live/queued counts)
      - Instagram and TikTok-specific tile renderers
      - media-first tiles using uploaded post media (`image`/`video`), with fallback cards when media missing
      - Instagram tile badges for non-published states
      - TikTok visual semantics (`Pinned` markers + views row with play icon)
    - preserved existing forecast logic:
      - Current Profile section = published-only
      - Projected Top 9 section = future-queued + published merge
    - kept existing audit panel and fix-actions intact (non-breaking)
  - `styles.css`
    - replaced old `.mock-profile/.mock-header` preview shell with scoped social-mock styles:
      - `.mock-social-shell`, `.mock-social-header`, `.mock-avatar`, `.mock-social-meta`
      - Instagram 4-column tighter grid (`gap: 2px`) with `4/5` aspect tiles
      - TikTok 3-column portrait feed with `9/16` aspect tiles and gradient overlays
      - tile-level primitives for realistic feed appearance:
        - `.mock-ig-tile`, `.mock-tt-tile`, `.mock-media`, `.tile-fallback`
        - `.mock-badge`, `.mock-pin`, `.mock-tt-views`, `.mock-tt-gradient`
  - Validation:
    - syntax checks pass (`node --check src/render.js && node --check src/main.js`)
    - local browser smoke check completed on `http://localhost:4174/index.html`
    - no new console/runtime errors observed during preview interactions

### Implementation Snapshot Addendum 27 (2026-03-26)
- Refactored Profile Preview into modular inspo-simulator cards and removed audit workflow per user direction:
  - `src/main.js`
    - removed `profileIntegrity` dependency from preview paint path
    - added persisted profile simulator settings store (`soci.profile.settings.v1`) with defaults for:
      - `handle`, `displayName`, `avatarUrl`
      - `followers`, `following`, `likes`
      - `bio`, `linkText`, `linkUrl`
    - wired `onProfileSettingsChange` to persist + re-render simulator cards live
  - `src/render.js`
    - removed Accuracy Audit logic/UI/actions entirely:
      - removed audit generator and related fix-button wiring
      - removed `integrity` / `onFixPost` preview interactions
    - added modular simulator-card renderers:
      - `toInstagramCard(posts, mediaMap, profile)`
      - `toTiktokCard(posts, mediaMap, profile)`
      - `renderSettingsPanel(profile)`
    - platform toggles now switch full inspo-style card renderers in Profile Preview
    - implemented strict thumbnail mapping behavior:
      - media resolved deterministically from first valid `post.mediaIds` entry present in media map
      - no random image substitution; missing media falls back to explicit title tile
    - added IG/TT tile semantics from post metadata:
      - Instagram type icons (`carousel`/`reel`/`video`) and publish-state badges
      - TikTok pinned treatment + views overlay row
  - `styles.css`
    - removed obsolete audit/integrity style blocks
    - added scoped simulator settings styles (`.simulator-settings*`)
    - added scoped inspo card styles (`.inspo-card*`, `.inspo-profile-*`, `.inspo-tabs`)
    - refined tile overlay icon containers and spacing for closer inspo fidelity
  - Validation:
    - syntax checks pass (`node --check src/main.js` and `node --check src/render.js`)
    - source scan confirms no active preview audit markers (`Accuracy Audit`, `audit-panel`, `data-fix`, `onFixPost`, `integrity`)
    - browser launch check completed on `http://localhost:4174/index.html`

### Implementation Snapshot Addendum 28 (2026-03-26)
- Refined sidebar action controls and Kanban horizontal scrolling UX per UI polish request:
  - `index.html`
    - upgraded `+ Client` action to icon button (`user-plus`) with clearer “New Client” label
    - grouped share/export actions into a compact control cluster:
      - `Share Link` icon button (`link-2`)
      - new expandable `Export` control (`download`) containing:
        - `CSV` (`file-spreadsheet`)
        - `ICS` (`calendar-down`)
    - preserved all existing element IDs (`#new-client`, `#copy-share-link`, `#export-csv`, `#export-ics`) to avoid JS behavior regressions
  - `styles.css`
    - added reusable sidebar action button treatment for icon-based controls (`.action-btn`)
    - added export dropdown styling (`.export-menu`, `.export-menu-list`)
    - improved Kanban horizontal scroll behavior and visual clarity:
      - enabled explicit horizontal overflow on `#kanban-view`
      - added thin themed scrollbar styles for WebKit and Firefox
      - slightly increased lane min width for cleaner scroll affordance
  - Verification:
    - local browser verification completed on `http://localhost:4174/index.html`
    - updated action grouping/icons and Kanban scrollbar rendering observed successfully

### Implementation Snapshot Addendum 29 (2026-03-26)
- Corrected Export control typography mismatch caused by native `<summary>` rendering:
  - `styles.css`
    - normalized `.export-menu summary` typography/line-height to match sidebar button scale
    - enforced consistent summary layout (`inline-flex`, full-width center alignment)
    - disabled residual native marker behavior via `summary::marker` fallback
  - Verification:
    - browser check confirms Export label now visually matches neighboring action buttons

### Implementation Snapshot Addendum 30 (2026-03-26)
- Hardened carousel preview to be a more honest, post-first platform mock aligned with `inspo/CAROUSEL preview.html` mechanics:
  - `src/render.js`
    - expanded inspector carousel preview module with:
      - slide intelligence list (`Slide N`, media type, computed aspect-ratio label)
      - IG base-ratio badge on first slide when in Instagram mode
      - robust first-slide ratio derivation for both image and video media (metadata-based fallback), clamped to IG bounds
      - richer TikTok shell overlays (top nav, right action rail, caption/music block) while keeping Soci styling tokens
    - preserved existing platform behavior parity:
      - IG first-slide ratio lock + subsequent center-crop
      - TikTok 9:16 frame + blurred background letterbox behavior
      - drag-scroll, snap, dots, and IG fraction counter
  - `styles.css`
    - added cohesive styling for new carousel modules:
      - slide list rows/thumbs/base-ratio badge
      - TikTok top rail, mode labels, right action stack, avatar add button
      - caption/music microcopy treatment and spacing
    - ensured additions inherit existing tokenized theme system for brand consistency
  - Verification status:
    - no build script available in project (`npm run build` missing)
    - code-level patching complete; browser parity smoke pass executed in-session

## Last Memory Update
- **Updated:** 2026-03-26 (latest)
- **By:** Claude Code
- **Reason:** Logged carousel preview parity hardening (slide ratio list, IG/TT realism updates, and styling coverage).
- 2026-03-26: Added new post type taxonomy (Photo, Video, Shorts, Carousel, Text), normalized legacy types, and implemented inspector carousel preview behavior inspired by inspo/CAROUSEL preview.html with Soci-branded styling.

### Implementation Snapshot Addendum 31 (2026-03-26)
- Improved media management and carousel preview sync for editor usability:
  - `src/main.js`
    - wired new inspector callbacks:
      - `onRemoveMedia(mediaId)`
      - `onReorderMedia(orderedMediaIds)`
    - these route directly to existing store actions and preserve non-breaking save/update flow
  - `src/render.js`
    - media list now renders in post order (`post.mediaIds`) instead of unordered filter order
    - upgraded media row actions:
      - explicit **Download original** button-style link
      - per-item **Delete** action
      - per-item **move up/down** controls for ordering carousel slides
    - added inline event handling for remove and reorder actions with status feedback
    - carousel preview now receives serialized caption payload and keeps preview copy synchronized with:
      - base caption (`#f-caption`)
      - platform caption variants (`#variant-instagram`, `#variant-tiktok`)
    - Instagram carousel preview now includes caption text block under the post chrome
    - TikTok carousel overlay copy/audio now updates live from caption fields
  - `styles.css`
    - added dedicated media action row styling (`.media-item-row`, `.media-item-actions`, `.btn-media`)
    - added emphasized download control style (`.btn-download-original`)
    - added danger treatment for delete action
    - added IG caption clamp styling in carousel preview (`.carousel-ig-caption`)
- Validation:
  - syntax checks pass for modified frontend modules via `node --check`
  - API health check successful (`GET /health` returned ok)
  - browser launch checks completed on local static host after UI updates

## Last Memory Update
- **Updated:** 2026-03-26 (latest)
- **By:** Claude Code
- **Reason:** Logged media-management UX improvements (delete/reorder/download controls) and live caption-sync behavior for carousel previews across Instagram/TikTok mock shells.

### Implementation Snapshot Addendum 32 (2026-03-26)
- Inspector responsiveness and hierarchy polish pass completed:
  - `src/render.js`
    - moved carousel phone preview above slide list in the inspector carousel block
    - normalized “Platform Captions” to section-title hierarchy (`section-title`) for parity with “Caption & Content”
    - switched collaboration/settings form rows to one-field-per-line via scoped row class usage (`.inspector-single`)
    - upgraded comment input from single-line `<input>` to `<textarea>` for better editor ergonomics
    - clarified destructive action label from `Delete` to `Delete Post`
  - `styles.css`
    - added scoped single-column inspector row utility (`.row.inspector-single`)
    - tightened section spacing for caption/tags/variant area with `section-title-tight` and tag-input spacing tweak
    - improved carousel shell presentation:
      - larger phone corner radius
      - rounded/contained inner screen
      - refined shadow and spacing
      - slide list wrapped in subtle surfaced container
    - improved destructive button styling (`.btn-danger`) for clearer affordance and stronger visual hierarchy
- Validation:
  - syntax checks pass: `node --check src/render.js` and `node --check src/main.js`
  - browser launch smoke-check executed on `http://localhost:4174/index.html` after UI updates

## Last Memory Update
- **Updated:** 2026-03-26 (latest)
- **By:** Claude Code
- **Reason:** Logged inspector responsiveness/layout polish and carousel preview ordering/radius updates, including delete-action visual improvements.

### Implementation Snapshot Addendum 33 (2026-03-26)
- Completed requested simulator mapping and carousel interaction fixes for client workflows:
  - `src/render.js`
    - profile simulator now reads/writes from the passed `profileSettings` so preview identity is client-specific in the active context
    - carousel Instagram shell now maps visible post details from simulator settings (likes + profile display/handle), reducing generic hardcoded meta noise
    - TikTok and Instagram carousel copy now stays synchronized to caption/base + platform variant fields
    - added draggable **left-side handle** for slide reordering in carousel slide list (`grip-vertical`), with optimistic local reorder + backend sync via existing reorder handler
    - removed stale unused post-meta fields that could desync visible simulator details
  - `styles.css`
    - slide list row updated to include dedicated left handle column
    - added drag-handle affordance styles (`grab`/`grabbing`) for discoverable reordering
    - added IG likes line style (`.carousel-ig-likes`) to match simulator detail mapping and improve hierarchy
- Validation:
  - syntax checks pass for `src/main.js` and `src/render.js` (`node --check`)
  - local browser smoke run completed against `http://localhost:4174/index.html`
  - carousel preview interaction verified (platform toggle + carousel area interaction) with no new console errors

## Last Memory Update
- **Updated:** 2026-03-26 (latest)
- **By:** Claude Code
- **Reason:** Logged per-client profile simulator mapping, Instagram carousel metadata fix, and draggable left-handle slide reorder update.

### Implementation Snapshot Addendum 34 (2026-03-26)
- Completed follow-up simulator/UI refinement pass for Instagram carousel realism and media action controls:
  - `src/render.js`
    - improved Instagram carousel interaction reactivity by throttling scroll index updates with `requestAnimationFrame` and clamped slide index math
    - tightened Instagram shell hierarchy mapping to profile settings (handle/display/likes) with reduced fallback hardcoding
    - normalized TikTok carousel audio fallback seed to active profile handle (no stale `your_brand` fallback)
    - updated IG action-row structure to improve icon/likes/caption spacing rhythm
    - removed media-list up/down arrow reorder controls under upload area
    - replaced media delete text button with icon-only trash action (`lucide: trash-2`)
  - `styles.css`
    - tuned Instagram carousel footer/likes/caption spacing and icon gaps for more natural visual rhythm
    - added icon-only media action button treatment for compact trash delete control
- Validation:
  - syntax checks pass (`node --check src/main.js`, `node --check src/render.js`)
  - browser launch smoke-check completed locally (`http://localhost:4174/index.html`) after layout/interaction updates

## Last Memory Update
- **Updated:** 2026-03-26 (latest)
- **By:** Claude Code
- **Reason:** Logged IG carousel spacing/reactivity fixes plus media-card action cleanup (trash icon delete, arrows removed).

### Implementation Snapshot Addendum 35 (2026-03-26)
- Verified and corrected Instagram carousel preview spacing/placement behavior in `inspo/CAROUSEL preview.html`:
  - Non-square slide placement:
    - ensured IG slides are explicitly `h-full` + `overflow-hidden` so media is cropped cleanly inside locked first-slide ratio container
    - set image positioning to `object-cover object-center` for centered crop behavior on mixed-aspect images
  - Action/dots/caption spacing rhythm:
    - made footer action row `relative` and reduced bottom margin for tighter like/caption spacing
    - kept dots centered with absolute middle placement and non-interactive pointer behavior
    - tightened likes/caption vertical spacing (`mb-0.5`, `leading-snug`) to better match inspo layout density
- Verification status:
  - browser launch smoke-check completed on local file preview (`file:///.../inspo/CAROUSEL preview.html`)
  - no console errors observed during verification launch

## Last Memory Update
- **Updated:** 2026-03-26 (latest)
- **By:** Claude Code
- **Reason:** Logged IG carousel preview parity fix in `inspo/CAROUSEL preview.html` (non-square crop centering + footer spacing alignment).

### Implementation Snapshot Addendum 36 (2026-03-26)
- Corrected scope to the real app inspector carousel preview (not just the inspo reference file):
  - `src/render.js`
    - moved platform toggle block to render **under** the phone preview in `renderCarouselPreview()`
    - updated Instagram footer structure in `renderInstagram()`:
      - added dedicated centered-dot class hook (`carousel-ig-dots`)
      - wrapped likes + caption in `carousel-ig-meta` for tighter spacing control
  - `styles.css`
    - improved non-square IG slide behavior via explicit clipping/centering (`.carousel-slide-ig` + `object-position:center` on cover media)
    - tightened IG footer rhythm and centered dots reliably (`.carousel-ig-footer` relative, `.carousel-ig-dots` absolute center)
    - reduced spacing between action row, likes, and caption (`.carousel-ig-meta`, likes/caption margins)
- Verification:
  - app smoke-check run at `http://localhost:4174/index.html` after patch
  - no console errors observed during browser session

## Last Memory Update
- **Updated:** 2026-03-26 (latest)
- **By:** Claude Code
- **Reason:** Logged real inspector carousel preview fix (IG non-square placement + action/dot/caption spacing) and moved IG/TikTok toggle under preview phone.

### Implementation Snapshot Addendum 37 (2026-03-26)
- Performed deep parity correction for Instagram carousel inspector preview spacing/cutoff issue:
  - Root cause identified: IG shell used `grid-template-rows: auto auto 1fr` while rendering four content regions (head/frame/footer/meta), causing the `1fr` row to absorb remaining height and visually push/clip likes + caption.
  - `styles.css` updates:
    - switched `.carousel-ig-shell` from grid to `flex` column flow for inspo-like vertical stacking
    - set `.carousel-ig-frame`, `.carousel-ig-footer`, `.carousel-ig-meta` to non-growing rows (`flex: 0 0 auto`)
    - added bottom margin room to `.carousel-ig-meta` to prevent lower text clipping in the phone viewport
- Verification:
  - browser launch check completed against real app (`http://localhost:4174/index.html`)
  - spacing/cutoff behavior improved and aligns with inspo structure expectations

## Last Memory Update
- **Updated:** 2026-03-26 (latest)
- **By:** Claude Code
- **Reason:** Logged IG carousel shell row-model fix that removed large footer/meta gap and caption clipping in the real inspector preview.

### Implementation Snapshot Addendum 38 (2026-03-26)
- Completed client-unique profile/post preview settings mapping so simulator identity is scoped per client (not global):
  - Backend persistence + validation:
    - `backend/db.js`
      - normalizes and stores `client.profileSettings` per client record
      - merges partial `profileSettings` patches on client updates without wiping existing keys
    - `backend/validators.js`
      - `validateClient()` now validates `profileSettings` as a constrained object with allowed fields and length limits
  - Frontend state normalization + mapping:
    - `src/store.js`
      - normalizes `profileSettings` on client ingest
      - exposes per-client update path via `updateClientProfileSettings(clientId, patch)`
    - `src/main.js`
      - resolves simulator settings from selected/active client using client-derived defaults + persisted client `profileSettings`
      - defaults are now generic/vague and client-based (`Client`, `brand`, `Profile bio`, `website`) rather than personal-name specific
    - `src/render.js`
      - profile simulator and carousel preview shells consume passed `profileSettings` from active client context
      - profile settings form updates are persisted back to that specific client mapping
- Verification:
  - syntax checks pass for touched modules (`backend/db.js`, `backend/validators.js`, `src/store.js`, `src/main.js`, `src/render.js`)
  - API-level multi-client persistence check confirms independent profile settings values are retained per client

## Last Memory Update
- **Updated:** 2026-03-26 (latest)
- **By:** Claude Code
- **Reason:** Logged client-unique simulator/profile settings mapping and generic client-derived defaults across preview surfaces.

### Implementation Snapshot Addendum 39 (2026-03-26)
- Agency-MVP polish pass for tenant-safe defaults and presentation:
  - `src/data.js`
    - removed remaining personal-name seed values in collaboration defaults
    - replaced with role-generic defaults for agency use:
      - `assignee: "Content Lead"`
      - `reviewer: "Account Lead"`
  - Confirms client-facing seed/demo content is generic and brand-agnostic while preserving existing workflow behavior.
- Verification:
  - syntax check passes for `src/data.js`
  - source scan confirms no remaining `Zac` / `your_brand` references in `src/*`

## Last Memory Update
- **Updated:** 2026-03-26 (latest)
- **By:** Claude Code
- **Reason:** Logged agency-MVP default cleanup to remove personal seed values and keep client-facing setup generic.

### Implementation Snapshot Addendum 40 (2026-03-27)
- Implemented storage durability hardening for media + JSON persistence safety:
  - Startup/storage config hardening:
    - `backend/config.js`
      - added backup-related config keys:
        - `backupDir`
        - `backupDataFile`
        - `backupUploadDir`
        - `backupManifestVersion`
    - `backend/server.js`
      - added startup storage layout checks/creation for runtime + backup directories
      - added warning when backup source paths diverge from runtime `DATA_FILE` / `UPLOAD_DIR`
  - Backup reliability upgrade:
    - `scripts/backup.sh`
      - now supports env-driven source/target paths (`APP_DIR`, `BACKUP_DIR`, `BACKUP_DATA_FILE`, `BACKUP_UPLOAD_DIR`)
      - fail-fast validation for missing DB/uploads source paths
      - validates `db.json` parse before archiving
      - generates `manifest.json` with deterministic file list + SHA-256 checksums
      - captures summary metadata (counts/bytes, timestamp, hostname, best-effort git commit)
      - supports optional `POST_BACKUP_HOOK` for off-host copy/replication
  - Restore confidence + integrity tooling:
    - added `scripts/verify-backup.sh`
      - validates archive structure (`manifest.json`, `db.json`)
      - verifies checksum + size for all manifest entries
      - validates DB media references resolve to files inside backup payload
    - added `scripts/check-storage-integrity.mjs`
      - checks live DB/uploads consistency
      - flags missing media files, dangling post→media references, duplicate media IDs, and orphan files
  - Documentation + environment updates:
    - `.env.example`
      - documented backup env keys and optional post-backup hook
    - `DEPLOYMENT.md`
      - replaced simple backup section with verified-backup runbook
      - added nightly backup + weekly verify + weekly integrity-check cron examples
      - added manual operational commands for backup/verify/integrity workflows
- Validation:
  - syntax/lint-level checks pass for updated scripts and backend modules:
    - `node --check backend/server.js`
    - `node --check backend/config.js`
    - `bash -n scripts/backup.sh`
    - `bash -n scripts/verify-backup.sh`
    - `node --check scripts/check-storage-integrity.mjs`

## Last Memory Update
- **Updated:** 2026-03-27 (latest)
- **By:** Claude Code
- **Reason:** Logged storage durability hardening (verified backups + checksum manifests + restore verification + live integrity scanner + backup path safety checks).

### Implementation Snapshot Addendum 41 (2026-03-27)
- Executed full local end-to-end durability workflow against project paths:
  - Backup command run with explicit project-scoped env paths:
    - `APP_DIR=/Users/zacry/Documents/VSCode Projects/Soci`
    - `BACKUP_DIR=/Users/zacry/Documents/VSCode Projects/Soci/backups`
    - `BACKUP_DATA_FILE=/Users/zacry/Documents/VSCode Projects/Soci/backend/data/db.json`
    - `BACKUP_UPLOAD_DIR=/Users/zacry/Documents/VSCode Projects/Soci/backend/uploads`
  - Results:
    - backup archive created successfully:
      - `backups/soci-backup-20260327-003754.tar.gz`
    - backup verification succeeded:
      - `manifestVersion: 1`
      - `filesVerified: 2`
      - `mediaReferencesChecked: 1`
    - live integrity check succeeded with zero drift:
      - `missingUploadFiles: 0`
      - `orphanUploadFiles: 0`
      - `warnings: 0`
      - `errors: 0`

## Last Memory Update
- **Updated:** 2026-03-27 (latest)
- **By:** Claude Code
- **Reason:** Logged successful end-to-end backup → verify → integrity execution and recorded resulting archive/check metrics.

### Implementation Snapshot Addendum 42 (2026-03-27)
- Implemented Phase 1 permission hardening across backend + frontend for safer multi-user client operations:
  - Backend scope/permission core:
    - added `backend/permissions.js` with centralized helpers:
      - `buildAccessContext(state, user)`
      - `canAccessClient(...)`
      - `canAccessPost(...)`
      - capability map generation (`getCapabilities(...)`)
  - Backend me-scope route expansion and enforcement (`backend/routes/me.js`):
    - added role-scoped capability payload in `GET /api/me/state`:
      - `authContext.capabilities`
      - `authContext.permissionsByClient`
    - added and enforced edit path for non-admin scoped users:
      - `POST /api/me/posts`
      - prevents cross-client post reassignment by non-admin users
    - added and enforced media mutation paths for non-admin scoped users:
      - `DELETE /api/me/posts/:postId/media/:mediaId`
      - `POST /api/me/posts/:postId/media/reorder`
    - comment path now uses centralized post-access checks
  - Frontend API surface (`src/api.js`):
    - added me-scope methods:
      - `upsertMyPost(...)`
      - `deleteMyPostMedia(...)`
      - `reorderMyPostMedia(...)`
  - Frontend store authorization behavior (`src/store.js`):
    - ingests and stores `authContext` from backend state
    - added capability helpers:
      - `canEditPost`, `canCommentOnPost`, `canManageUsers`, `canManageClients`, `canCreatePosts`
    - routes non-admin post/media writes to me-scope APIs
    - blocks unauthorized create/edit/comment/delete/duplicate actions in store layer
  - Frontend UI permission gating (`src/main.js`, `src/render.js`):
    - top-level action controls now disable/hide by capability:
      - create post, create client, share/export controls, manage users
    - inspector now receives explicit permission object and disables restricted controls:
      - save, duplicate, delete, comment, upload, media delete, platform/settings inputs
      - carousel reorder callback only wired when allowed
  - Capability alignment fix:
    - `canUploadMedia` in `backend/permissions.js` is admin-only to match current `/api/admin/media` route scope.
- Validation:
  - syntax checks pass:
    - `node --check backend/permissions.js`
    - `node --check backend/routes/me.js`
    - `node --check src/api.js`
    - `node --check src/store.js`
    - `node --check src/main.js`
    - `node --check src/render.js`

## Last Memory Update
- **Updated:** 2026-03-27 (latest)
- **By:** Claude Code
- **Reason:** Logged Phase 1 permission hardening implementation (centralized scope checks, me-scope mutation endpoints, frontend capability gating, and syntax validation).

### Implementation Snapshot Addendum 43 (2026-03-27)
- Ran full role-based runtime smoke verification for permission hardening using isolated local API runtime:
  - ephemeral server config:
    - `PORT=8791`
    - isolated DB: `backend/data/permission-smoke-db.json`
    - isolated uploads: `backend/uploads-smoke`
  - server startup/log:
    - API base: `http://localhost:8791`
    - log file: `backend/data/permission-smoke-server.log`
- Verified pass conditions by role:
  - Owner/Admin:
    - login succeeds
    - create client/post/users/memberships succeeds
  - Helper (`helper_staff` with `view/comment/edit`):
    - `GET /api/me/state` succeeds with `canCreatePosts=true`
    - scoped post edit/create succeeds
    - cross-client move attempt is blocked (`403`)
    - admin-state access blocked (`401`)
  - Client (`client_user` with `view/comment`):
    - `GET /api/me/state` succeeds with `canCreatePosts=false`
    - internal posts are not returned in scoped state
    - create post blocked (`403`)
    - edit internal post blocked (`403`)
    - comment on shareable post succeeds (`200`)
- Outcome:
  - role-scoped permission model is functionally validated for core allow/deny flows.

## Last Memory Update
- **Updated:** 2026-03-27 (latest)
- **By:** Claude Code
- **Reason:** Logged successful end-to-end runtime role smoke tests for owner/helper/client permission behavior.

### Implementation Snapshot Addendum 44 (2026-03-27)
- Implemented targeted UI/UX polish across layout, workflow discoverability, details clarity, and sidebar controls with minimal file footprint:
  - `index.html`
    - made brand title actionable (`#brand-home`) to restore default workspace/dashboard state
    - added kanban overflow hint element (`#kanban-overflow-hint`)
    - upgraded sign-out affordance with dedicated button class (`.btn-signout`)
  - `styles.css`
    - improved default three-panel comfort by widening/resizing rails:
      - shell columns now use `minmax(...)` ranges
      - left sidebar and right details panel support horizontal resize
    - improved filter row density and spacing behavior
    - added kanban overflow edge gradients + hint styling for better horizontal overflow discoverability
    - improved inspector tab affordance/contrast (default + hover + active clarity)
    - improved readiness visuals:
      - low-readiness fill visibility tuning
      - compact progress micro-bar in cards
    - added polish utilities used by render updates:
      - `.settings-note`, `.preview-pill`, `.calendar-next-event`, `.profile-toggle`, `.btn-signout`
  - `src/render.js`
    - post card date now renders friendly format (e.g., `Apr 1, 2026`)
    - post card readiness text now includes a compact visual progress bar
    - calendar API extended with optional next-event affordance and jump callback
    - profile simulator supports draft-label visibility toggle wiring
    - details panel copy/labeling updates for preview clarity and settings context notes
  - `src/main.js`
    - added brand-home behavior to reset/reveal core workspace panels and exit share hash state
    - added kanban overflow state sync (left/right edge cues + start hint visibility)
    - theme toggle wording clarified to “Light Mode / Dark Mode”
    - calendar now computes nearest scheduled event and provides quick-jump behavior
    - profile simulator state now includes `showDraftLabels` toggle persistence in-session
- Validation:
  - syntax checks passed:
    - `node --check src/main.js`
    - `node --check src/render.js`
  - browser smoke test performed via local static server and Puppeteer launch (`http://localhost:4174/index.html`), confirming app boots post-change.

## Last Memory Update
- **Updated:** 2026-03-27 (latest)
- **By:** Claude Code
- **Reason:** Logged UI/UX polish implementation for layout comfort, kanban overflow discoverability, card/status clarity, details panel affordance, and profile/calendar usability improvements.

### Implementation Snapshot Addendum 45 (2026-03-27)
- Completed a full responsive hardening pass focused on phone/tablet usability and touch ergonomics:
  - `styles.css`
    - added staged responsive breakpoints at:
      - `max-width: 1024px`
      - `max-width: 900px`
      - `max-width: 760px`
      - `max-width: 600px`
      - `max-width: 480px`
    - fixed mobile shell constraints:
      - forces `.sidebar` and `#inspector-panel` to mobile-safe sizing (`min-width: 0`, `max-width: 100%`, `width: 100%`) under narrow breakpoints
      - disables desktop-only horizontal resize handles on tablet/mobile (`resize: none`)
      - reduced shell spacing at small widths (`.app-shell` padding/gap tightened to `10px` then `8px`)
    - improved touch targets and control ergonomics:
      - set shared control min-height baseline
      - enforced 44px tap-size floor on calendar nav buttons
      - tightened topbar/filterbar spacing and wrapping for compact screens
    - improved dense UI behavior on narrow viewports:
      - inspector action bar now wraps safely with Save on its own row
      - media action rows stack cleanly at phone widths
      - simulator settings grid collapses to single-column on smaller screens
      - profile header/avatar scales down for phone
    - reduced preview domination on mobile:
      - responsive carousel phone dimensions replace fixed-feel sizing on small screens
      - carousel controls/list widths scale down at `760/480`
    - calendar and kanban mobile handling improvements:
      - mobile calendar grid gets minimum day widths and horizontal safety behavior
      - kanban lane width tuned for touch-scrolling readability on mobile
    - login responsiveness:
      - added small-screen card sizing for `.lc` at `max-width: 480px`
- Validation:
  - local static app served and launched successfully (`http://localhost:4174/index.html`)
  - browser smoke session completed post-change with no new console errors

## Last Memory Update
- **Updated:** 2026-03-27 (latest)
- **By:** Claude Code
- **Reason:** Logged comprehensive mobile responsiveness pass (breakpoints, shell sizing, touch targets, inspector/mobile layout fixes, and responsive carousel/login adjustments).

### Implementation Snapshot Addendum 46 (2026-03-27)
- Fixed planning-workspace responsive clipping issues in the middle section where controls and text overflowed card bounds at narrow widths:
  - `styles.css`
    - made top view toggle group (`.view-toggles`) fluid and width-safe:
      - changed columns to `repeat(3, minmax(0, 1fr))`
      - added width/flex constraints (`width: min(100%, 420px)`, `min-width: 0`, `flex: 1 1 280px`)
    - hardened tab labels (`.tab`) against text spill:
      - `min-width: 0`, `white-space: nowrap`, `overflow: hidden`, `text-overflow: ellipsis`
    - improved topbar wrap behavior under phone widths:
      - forced first topbar block, toggle group, and workspace controls to full-row basis at `max-width: 760px`
    - relaxed icon-button label truncation on tighter tablet/mobile layouts:
      - removed restrictive span max-width in responsive context (`max-width: none` at `max-width: 900px`)
    - ensured calendar header helper chip (`.calendar-next-event`) does not overflow at small widths:
      - `margin-left: 0`, `max-width: 100%` at `max-width: 480px`
- Verification:
  - browser launch/smoke checks were run locally on `http://localhost:3000/index.html` after the CSS patch.

## Last Memory Update
- **Updated:** 2026-03-27 (latest)
- **By:** Claude Code
- **Reason:** Logged responsive clipping fix for planning middle-section controls/toggle text overflow and calendar chip containment on narrow widths.

### Implementation Snapshot Addendum 47 (2026-03-27)
- Applied corrective follow-up for planning workspace middle-card responsiveness after user-reported oversized/off-card controls:
  - `styles.css`
    - restored compact control sizing for `.view-toggles` (content-fit columns via `repeat(3, minmax(88px, auto))`, removed stretch sizing)
    - prevented control strip overflow from escaping planning card by enforcing containment on section header:
      - `.section-head { min-width: 0; overflow: hidden; }`
      - preserved `.workspace-section { overflow: hidden; }`
    - corrected tablet breakpoint behavior (`max-width: 900px`) to wrap controls instead of forcing full-width oversized rows:
      - `.topbar` now wraps in row mode
      - heading block takes full row while toggle/control groups remain `width:auto`
      - tightened toggle/control sizing and label truncation (`.workspace-controls .icon-btn span { max-width: 11ch; }`)
    - retained mobile safety behavior (`max-width: 760px`/`480px`) for no-clipping/no-overflow while preserving intended visual scale.
- Verification:
  - browser verification pass run on local app (`http://localhost:3000/index.html`) after corrective patch.

## Last Memory Update
- **Updated:** 2026-03-27 (latest)
- **By:** Claude Code
- **Reason:** Logged corrective responsive patch ensuring planning-workspace controls stay inside the card without oversized button behavior.

### Implementation Snapshot Addendum 48 (2026-03-27)
- Added targeted calendar responsiveness hardening to prevent clipping/overflow on small widths:
  - `styles.css`
    - strengthened calendar grid sizing constraints:
      - `.calendar-grid` now uses `repeat(7, minmax(0, 1fr))` with `width: 100%`
      - `.day` now enforces `min-width: 0`, internal overflow containment, and flex column flow
    - prevented chip text overflow in narrow cells:
      - title/meta lines now use ellipsis truncation
      - smallest breakpoint hides `.chip-meta` for readability
    - refined responsive breakpoints:
      - `max-width: 900px`: reduced day/chip density
      - `max-width: 760px`: schedule section allows controlled horizontal scroll and keeps week layout stable via min grid width
      - `max-width: 480px`: tighter day/chip sizing to keep cards inside section bounds
- Verification:
  - browser verification run on local app (`http://localhost:3000/index.html`) after patch.

## Last Memory Update
- **Updated:** 2026-03-27 (latest)
- **By:** Claude Code
- **Reason:** Logged calendar-specific responsive containment and chip-overflow fixes for mobile/tablet widths.

### Implementation Snapshot Addendum 49 (2026-03-27)
- Implemented requested calendar UX updates with minimal-file changes (`src/render.js`, `src/main.js`, `styles.css`):
  - Next Scheduled control update:
    - replaced text CTA with icon-only calendar button in calendar nav when jump target is available
    - hover/focus text now uses exact tooltip label: `Jump to Next Scheduled`
    - retained existing jump callback behavior via `onJumpToDate`
  - Weekly calendar view support:
    - added calendar mode toggle (`Month` / `Week`) in calendar nav
    - added week-range rendering path (7-day grid with weekday labels)
    - preserved existing month grid behavior as default
    - navigation arrows now switch behavior by mode:
      - month mode → month offset
      - week mode → week offset
    - jump-to-next-scheduled now updates both month and week offsets for correct landing in either mode
  - Styling support:
    - added calendar nav grouping classes for mode/action alignment
    - added week/month toggle pill styles + active state
    - added weekly day weekday label style (`.day-weekday`)
    - added icon-only styling for next-scheduled button

## Last Memory Update
- **Updated:** 2026-03-27 (latest)
- **By:** Claude Code
- **Reason:** Logged calendar next-scheduled icon tooltip update and new week-view calendar mode with mode-aware navigation.

### Implementation Snapshot Addendum 50 (2026-03-27)
- Refined calendar header aesthetics and control clarity for month/week navigation without changing underlying scheduling logic:
  - `src/render.js`
    - restructured calendar nav into clearer zones:
      - primary segmented nav (`prev` + centered range label + `next`)
      - secondary action row (Month/Week toggle + next-scheduled icon action)
    - improved control semantics/accessibility:
      - dynamic arrow labels/tooltips now read `Previous/Next Month` or `Previous/Next Week` based on active mode
  - `styles.css`
    - introduced unified segmented-control visual language for calendar nav:
      - new `.calendar-nav-primary`, `.calendar-nav-segment`, `.calendar-nav-secondary`, `.calendar-nav-label`, `.calendar-arrow`
      - improved spacing rhythm, rounded surfaces, and active/hover consistency across arrows + mode toggle
    - reduced visual noise of next-scheduled icon while keeping discoverability
    - added mobile-specific nav layout behavior to stack controls cleanly and preserve readability at narrow widths

## Last Memory Update
- **Updated:** 2026-03-27 (latest)
- **By:** Claude Code
- **Reason:** Logged calendar nav aesthetic re-architecture (segmented arrows, clearer month/week toggle hierarchy, and responsive polish).

### Implementation Snapshot Addendum 51 (2026-03-27)
- Implemented inspector post preview expansion to support social-mockup-style previews for non-carousel post types using the provided `inspo/social mockup generator.html` direction:
  - `src/render/inspector/socialMockups.js` (new modular inspector renderer)
    - added platform-authored mockup renderers for:
      - Instagram
      - TikTok
      - X (Twitter)
      - Facebook
      - LinkedIn
      - Reddit
    - added in-preview platform switcher and state-safe platform normalization
    - added media fallback handling when no upload exists
    - added runtime icon hydration support via Lucide
  - `src/render.js`
    - integrated social mockup renderer into inspector media preview path for non-carousel types (`photo`, `video`, `shorts`, `text`)
    - preserved carousel preview path untouched for carousel-specific behavior
    - wired social preview initialization and platform-change callback routing
  - `src/main.js`
    - added persisted in-session inspector preview platform state (`inspectorPreviewPlatform`)
    - passed platform selection + change handler into inspector render pipeline
  - `styles.css`
    - added scoped `spm-*` styles for mockup cards, platform switches, media treatment, and TikTok overlay rail
    - kept styling isolated to avoid regressions in existing carousel/profile simulator systems
  - Modularization follow-through:
    - added `src/render/kanban.js` as part of ongoing render-layer modular extraction and separation of concerns
- Validation:
  - syntax checks passed:
    - `node --check src/main.js`
    - `node --check src/render.js`
    - `node --check src/render/shared.js`
    - `node --check src/render/kanban.js`
    - `node --check src/render/inspector/socialMockups.js`
  - browser verification run on local static server (`http://localhost:4174/index.html`) and inspector interaction smoke-checked post-change.

## Last Memory Update
- **Updated:** 2026-03-27 (latest)
- **By:** Claude Code
- **Reason:** Logged inspector post preview social mockup expansion (IG/TikTok/X/Facebook/LinkedIn/Reddit), renderer wiring, scoped styles, and verification status.

### Implementation Snapshot Addendum 52 (2026-03-27)
- Implemented Simple Icons-based platform rail for inspector social mockup switcher with glass slider indicator and hover tooltips:
  - `src/render/inspector/socialMockups.js`
    - replaced text platform pills with icon-first button rendering sourced from Simple Icons CDN (`cdn.simpleicons.org`)
    - added platform metadata map for stable label/icon slug control
    - added tooltip labels per platform (`Instagram`, `TikTok`, `X / Twitter`, `Facebook`, `LinkedIn`, `Reddit`)
    - added active indicator state wiring via CSS vars (`--spm-active-index`, `--spm-count`) and paint-cycle updates
    - preserved existing platform IDs and preview persistence behavior (`instagram`, `tiktok`, `twitter`, `facebook`, `linkedin`, `reddit`)
  - `styles.css`
    - upgraded `.spm-switch` to glass rail treatment
    - added gradient active slider button (`.spm-switch-indicator`) aligned to wasabi/ginger accent system
    - added icon hover/active transition states and tooltip visuals
  - `index.html`
    - added preconnect hint for `https://cdn.simpleicons.org` for faster icon fetch
- Validation:
  - syntax checks pass:
    - `node --check src/render/inspector/socialMockups.js`
    - `node --check src/main.js`
    - `node --check src/render.js`
  - browser launched successfully on local static host (`http://localhost:4174/index.html`) after changes

## Last Memory Update
- **Updated:** 2026-03-27 (latest)
- **By:** Claude Code
- **Reason:** Logged Simple Icons platform rail conversion with gradient glass active indicator + tooltips for inspector social mockup switcher.

### Implementation Snapshot Addendum 53 (2026-03-27)
- Completed simulator cleanup and mapping reliability pass for inspector post preview based on user QA:
  - `src/render/inspector/socialMockups.js`
    - fixed LinkedIn platform switch icon by replacing icon dependency with inline SVG platform glyphs for all switch buttons
    - made platform switcher icons monochrome via `currentColor` so they inherit title text color and turn white on active/hover states
    - removed unnecessary static fake engagement copy outside core simulator content (`likes/comments/reactions/upvotes` footer-style counters)
  - Live mapping behavior verified:
    - social simulator now continuously reflects inspector `Title`, `Caption`, and `Platform Captions` (`variant-*`) through existing `initSocialMockupPreview` input listeners
  - `styles.css`
    - added explicit SVG sizing hook for switch icons (`.spm-switch-icon svg`) to keep platform glyph rendering consistent
- Validation:
  - syntax checks pass:
    - `node --check src/render/inspector/socialMockups.js`
    - `node --check src/render.js`
    - `node --check src/main.js`
  - source scan confirms no remaining fake engagement footer text in social mockup renderer

## Last Memory Update
- **Updated:** 2026-03-27 (latest)
- **By:** Claude Code
- **Reason:** Logged LinkedIn icon fix, monochrome platform switch behavior, fake engagement cleanup, and caption/content-to-simulator mapping verification.

### Implementation Snapshot Addendum 54 (2026-03-27)
- Standardized social platform switcher icon sizing using Simple Icons path data in vanilla renderer:
  - `src/render/inspector/socialMockups.js`
    - replaced ad-hoc inline icon map with normalized Simple Icons path constants for:
      - Instagram, TikTok, X/Twitter, Facebook, LinkedIn, Reddit
    - each icon now renders through one shared 24x24 SVG wrapper using `currentColor`, ensuring consistent monochrome behavior and uniform scale
  - `styles.css`
    - confirmed explicit shared sizing contract remains in place:
      - `.spm-switch-icon { width: 18px; height: 18px; }`
      - `.spm-switch-icon svg { width: 18px; height: 18px; }`
- Verification:
  - syntax checks pass:
    - `node --check src/render/inspector/socialMockups.js`
    - `node --check src/render.js`
    - `node --check src/main.js`
  - source scan confirms switcher icon sizing selectors are consistently applied in CSS

## Last Memory Update
- **Updated:** 2026-03-27 (latest)
- **By:** Claude Code
- **Reason:** Logged Simple Icons path normalization and uniform social switcher icon sizing verification.

### Implementation Snapshot Addendum 55 (2026-03-27)
- Completed inspector layout anchoring + preview parity polish requested in latest UI pass:
  - `src/render.js`
    - moved inspector action row (`Save`, `Duplicate`, `Delete`) to be a direct footer element without the extra divider above it, improving clean bottom docking behavior in both pinned and floating inspector modes
  - `styles.css`
    - made `.inspector` a flex-column container and set `.inspector-actions { margin-top: auto; position: sticky; bottom: 0; }` so the action row stays bottom-anchored even when content is short
    - added `.inspector-pane` active-pane flex-column behavior to preserve stable vertical flow
    - changed `.content-pane-grid` alignment to `stretch` and made preview/card containers fill available row height:
      - `.content-pane-preview` now flex-column
      - `.post-preview-card` now flex-column
      - `.post-preview-media` now flexes to occupy available height
    - this creates visual height parity between preview column and content-entry column at wide inspector widths
    - refined social toggle spacing (`.spm-shell` gap + `.spm-switch` padding/margin) for cleaner balance under preview
  - `src/render/inspector/socialMockups.js`
    - reordered social mockup shell to render preview stage first and platform rail second (toggle now appears below preview)
- Verification:
  - syntax checks pass:
    - `node --check src/render/inspector/socialMockups.js`
    - `node --check src/render.js`
    - `node --check src/main.js`
  - source-order check confirms social toggle now renders below preview stage (`spm-stage` before `spm-switch`)

## Last Memory Update
- **Updated:** 2026-03-27 (latest)
- **By:** Claude Code
- **Reason:** Logged inspector bottom action anchoring, preview-height parity adjustments, and social toggle-under-preview layout update.

### Implementation Snapshot Addendum 56 (2026-03-27)
- Fixed floating/unpinned inspector footer overlap where action buttons blocked bottom content:
  - `styles.css`
    - kept sticky bottom action behavior for pinned inspector
    - added floating-mode override so action row renders below content instead of overlaying it:
      - `body:not(.inspector-pinned) .inspector-actions { position: static; bottom: auto; ... }`
      - removed overlay visuals for floating mode (`border-top`, background blur) and applied simple top spacing
    - added narrow-screen refinement (`max-width: 760px`) to keep footer spacing comfortable in floating mode
- Validation:
  - source scan confirms unpinned override and responsive rule are present
  - syntax checks pass:
    - `node --check src/render.js`
    - `node --check src/main.js`
    - `node --check src/render/inspector/socialMockups.js`

## Last Memory Update
- **Updated:** 2026-03-27 (latest)
- **By:** Claude Code
- **Reason:** Logged floating/unpinned inspector footer overlap fix to keep Save/Duplicate/Delete below content without clipping.

### Implementation Snapshot Addendum 57 (2026-03-27)
- Applied stricter inspector action-row mode split to fully resolve floating/unpinned overlap:
  - `styles.css`
    - changed `.inspector-actions` base style to non-sticky/static flow (safe default)
    - moved sticky footer behavior to pinned mode only:
      - `body.inspector-pinned .inspector-actions { position: sticky; bottom: 0; ... }`
    - retained floating mode natural flow and pane scrolling behavior:
      - `body:not(.inspector-pinned) .inspector { display: block; ... }`
      - `body:not(.inspector-pinned) .inspector-pane:not(.hidden) { display: block; }`
    - this eliminates any cross-mode sticky inheritance that could still pin/overlay action buttons in floating inspector.
- Browser verification loop:
  - relaunched local app and re-opened inspector after CSS split
  - closed browser session cleanly after validation pass

## Last Memory Update
- **Updated:** 2026-03-27 (latest)
- **By:** Claude Code
- **Reason:** Logged pinned-only sticky footer architecture so floating/unpinned inspector action row always renders below content without overlap.
