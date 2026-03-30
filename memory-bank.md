## 🔨 Projects

### Soci — Multi-tenant Social Planning App
- **Objective:** Ship a stable social planning system where owner/admin can manage all workspaces and non-admin users manage only assigned workspaces.
- **Current posture:** Production-capable MVP (Node API + static frontend) with role-aware state bootstrap, workspace scoping, media upload, share calendar, export, and backup/integrity tooling.
- **Success gates:**
  - No cross-workspace data leakage.
  - Reliable CRUD + media flows with visible error reporting.
  - Non-breaking UX iteration across Kanban/Calendar/Preview/Inspector.

## ⚙️ Areas

- **Product:** content lifecycle planning (idea → in-progress → in-review → ready), scheduling, collaboration, readiness gating.
- **Platform:** zero-dependency Node HTTP backend, file-backed JSON DB, static frontend.
- **Security/Auth:** token auth, role + membership permissions, scoped `/api/me/*` mutations.
- **Ops:** VPS deploy hardening, backup/verify/integrity checks, path safety.
- **UX:** glassmorphism theme system, responsive layout, inspector + social simulator parity.

## 📚 Resources

- **Primary inspiration:** `inspo.md`, `inspo/CAROUSEL preview.html`, `inspo/social mockup generator.html`, `inspo/New Plan.md`.
- **Deploy docs:** `DEPLOYMENT.md`, `.env.example`.
- **Ops scripts:** `scripts/backup.sh`, `scripts/verify-backup.sh`, `scripts/check-storage-integrity.mjs`.

## 📥 Archives

- Historical Addenda 1–58 were consolidated into `MEM_CONSOLIDATE` below.
- Prior append-only timeline is intentionally compressed to remove duplicate validation logs and stale assumptions.

---

## MEM_CONSOLIDATE

### 1) MAP

#### Dir tree (active architecture)
- `index.html` — app shell + login/register UI + layout containers.
- `styles.css` (+ `styles/*.css` split set) — token/theme/layout/responsive/social/carousel styling.
- `src/main.js` — app orchestration, auth screen logic, render subscriptions, handlers.
- `src/store.js` — state container + API sync + capability checks + mutation guards.
- `src/api.js` — transport/auth helpers + admin/me/share endpoints + media upload client.
- `src/render.js` + `src/render/*` — Kanban/Calendar/Inspector/Profile/Share render modules.
- `backend/server.js` — route registration + security/cors dispatch.
- `backend/routes/*.js` — `auth`, `admin`, `me`, `share`, `uploads`, `health`.
- `backend/db.js` — normalized state, atomic queued writes, CRUD helpers.
- `backend/permissions.js` — access context + capability derivation.
- `backend/validators.js` — payload validation (`post/client/user/membership/comment/registration`).

#### Entry points
- Frontend: `index.html` → `src/main.js`.
- Backend: `npm run api` → `backend/server.js`.
- Auth routes: `POST /api/auth/login`, `POST /api/auth/register`.
- State routes: `GET /api/admin/state`, `GET /api/me/state`.

#### Package/runtime dependencies
- Runtime: Node.js core modules + browser native APIs; zero backend framework.
- Frontend libs via CDN: Lucide (icon hydration), Simple Icons assets.
- Infra/tooling: PM2 + Nginx + Cloudflare + Vercel/Hostinger workflow (documented).

---

### 2) LOGIC

#### Core algorithms
- **Profile ordering:** deterministic sort for feed-like previews (`sortByProfileOrder`).
- **Status gating:** blocks promotion when schedule/approval/workspace constraints fail.
- **Share filtering:** exposes only shareable scheduled posts for workspace share views.
- **Media normalization:** resolves relative upload paths to API origin to prevent host mismatch 404.
- **Atomic persistence:** queued read-modify-write prevents stale overwrite races.

#### State flow
1. App boot checks hash/auth/local bypass.
2. Authenticated users bootstrap from:
   - admin roles → `/api/admin/state`
   - non-admin roles → `/api/me/state`
3. Store normalizes entities + authContext + capabilities.
4. UI renders filtered datasets to Kanban/Calendar/Grid/Inspector.
5. Mutations route by role/capability:
   - admin paths → `/api/admin/*`
   - scoped paths → `/api/me/*`
6. Errors surfaced via centralized store error handler → toasts (no silent failures).

#### Auth gates
- Token includes role/userId/email.
- Owner/admin can manage users/workspaces/global state.
- Helper/client access constrained by membership + permissions map.
- Non-admin cross-workspace reassignment blocked.
- Current upload capability intentionally admin-only in capability model (known constraint).

---

### 3) DB

#### Storage model
- File DB: `backend/data/db.json`.
- Upload dir: `backend/uploads/`.
- Primary collections:
  - `clients` (workspace records; includes optional `profileSettings`)
  - `posts` (includes `clientId`, workflow, publish metadata, `mediaIds`, visibility)
  - `media` (file metadata + `urlPath`)
  - `shareLinks` (tokenized workspace share access)
  - `users` (email/role/passwordHash)
  - `memberships` (user↔workspace + permissions)
  - `activity` (comments/events)

#### Schema relationships
- `client 1—N posts`
- `post 1—N media` (ordered by `post.mediaIds`)
- `client 1—N shareLinks`
- `user N—N client` via `memberships`
- `post 1—N comments/activity`

#### Query/mutation patterns
- Reads: role-scoped state hydration (`admin state` vs `me state`).
- Writes: queued atomic mutations in DB layer; helpers abstract direct file writes.
- Cleanup: post/client delete performs best-effort associated media file cleanup.
- Upload serving: extension-based content-type + inline/attachment mode.

---

### 4) DEBT

#### Known bugs / risk points
- Upload read-path isolation must remain audited; guessed media URLs are a sensitive boundary.
- Capability mismatch risk: non-admin edit rights exist while upload remains admin-only.
- Large single-source files (`src/main.js`, `memory-bank.md`) still pressure maintainability.

#### TODOs (high-priority)
- Add integration coverage to ensure upload retrieval access checks remain enforced end-to-end.
- Add automated integration tests for role matrix (owner/helper/client) and media access denial cases.
- Replace remaining prompt/confirm driven workspace actions with in-app modal flows.
- Add changelog discipline (`CHANGELOG.md`) to align with rule set.

#### Legacy hooks / compatibility layers
- Env-admin login fallback retained for backward compatibility.
- Legacy terminology in internals (`clientId`, `createClient`) intentionally preserved while UI says Workspace.
- Localhost auth bypass retained for design QA only.
- Legacy API base normalization retained to sanitize old persisted base URLs.

---

### 5) CONTEXT

#### Dev intent
- Keep app non-breaking while moving from prototype to scoped multi-tenant SaaS behavior.
- Prefer additive migrations over rewrites.
- Keep zero-cost/open-source stack, minimal dependencies, simple operational model.

#### UX requirements
- Fast planning loop: Kanban + Calendar + Preview + Inspector in sync.
- Clear permission UX: disable or hide restricted controls by capability.
- High-confidence editor behavior: explicit validation/errors, no silent persistence failures.
- Mobile-safe responsive shell and readable dense controls.

#### Guardrails
- Preserve data contracts unless migration path is explicit.
- Keep share mode privacy-safe and read-only.
- Maintain backup + verify + integrity routines as standard ops baseline.
- Prefer concentrated edits over file proliferation.

---

## Last Memory Update
- **Updated:** 2026-03-29
- **By:** Claude Code
- **Reason:** Refined owner user-management actions for cleaner interaction: switched to icon-only controls, added row-scoped busy/disabled locking for async actions, and introduced compact action-button styling for better per-row responsiveness.
