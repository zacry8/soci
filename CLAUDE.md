# Soci — Claude Code Context

## What this is
Social media content management tool for agencies. Admin creates clients, drafts posts (with captions, tags, platforms, schedule dates), uploads media, and generates read-only share links for clients to preview their content calendar.

## Stack
- **Frontend**: Vanilla JS + CSS, no framework, no build step — `index.html` + `src/` + `styles.css`
- **Backend**: Zero-dependency Node.js (`node:http`, `node:fs`, `node:crypto`) — `backend/server.js`
- **Database**: JSON file (`backend/data/db.json`) — never commit this
- **Media**: Binary files on disk (`backend/uploads/`) — never commit this
- **Auth**: JWT (HS256) via `backend/auth.js`

## Running locally
```bash
npm run api        # starts backend on http://localhost:8787
# open index.html in browser (or use Live Server)
```

## Deployment
- **Frontend**: Vercel → `soci.hommemade.xyz` (auto-deploys on push to `main`)
- **Backend**: Docker container on Hostinger VPS (`72.61.145.94`) behind Traefik → `api.soci.hommemade.xyz`
- **CI/CD**: Push to `main` → GitHub Actions SSHes into VPS → `git pull` + `docker compose up -d --build soci`
- **VPS repo path**: `/root/soci`
- **VPS docker-compose**: `/root/docker-compose.yml` (shared with n8n + Traefik)
- **GitHub repo**: `github.com/zacry8/soci`

## Key files
| File | Purpose |
| --- | --- |
| `backend/server.js` | Thin HTTP entry point — CORS, security headers, route dispatch |
| `backend/router.js` | Minimal zero-dependency route matcher (supports `:param` segments) |
| `backend/validators.js` | Input validation for client and post payloads |
| `backend/routes/auth.js` | `POST /api/auth/login` — rate limiting, timing-safe credential check |
| `backend/routes/admin.js` | All `/api/admin/*` endpoints (state, clients, posts, media, share-links) |
| `backend/routes/share.js` | `GET /api/share/calendar` — token-based read-only client view |
| `backend/routes/uploads.js` | `GET /uploads/:filename` — static file serving |
| `backend/routes/health.js` | `GET /health` |
| `backend/db.js` | JSON persistence — atomic read-modify-write queue, tmp+rename writes |
| `backend/auth.js` | JWT create/verify |
| `backend/config.js` | All config from env vars with defaults |
| `backend/utils.js` | CORS, JSON body parsing, file name sanitization, UUID |
| `src/api.js` | Frontend API client |
| `src/main.js` | App state and routing |
| `src/render.js` | DOM rendering |
| `.github/workflows/deploy.yml` | Auto-deploy workflow |
| `Dockerfile` | Node 22 Alpine image for the API |
| `scripts/backup.sh` | Nightly backup of db.json + uploads (cron on VPS) |

## Data model
```
Clients → Posts → Media
       └→ ShareLinks
```
- Client: `id, name, channels[], shareSlug, sharingEnabled`
- Post: `id, clientId, title, caption, tags[], platforms[], status, visibility, scheduleDate, mediaIds[]`
- Media: `id, postId, fileName, mimeType, sizeBytes, urlPath`
- ShareLink: `id, clientId, token, expiresAt, revokedAt`

## Important constraints
- **Never add npm dependencies** — project is intentionally zero-dependency
- **Never commit** `.env`, `backend/data/db.json`, `backend/uploads/`, `backend/data/db.json.tmp`
- `DATA_FILE` and `UPLOAD_DIR` in `.env` point to Docker volume paths (`/data/db.json`, `/uploads`)
- Uploads are served publicly at `/uploads/{uuid}.ext` — UUID naming makes guessing infeasible
- Allowed upload MIME types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `video/mp4`, `video/quicktime`, `video/webm`, `application/pdf`
- `db.js` uses an `enqueue()` wrapper that serializes the full read-modify-write for every write operation — do not bypass this or call `saveState` directly

## Env vars (see .env.example)
`PORT`, `APP_BASE_URL`, `API_BASE_URL`, `CORS_ORIGINS`, `MAX_JSON_BYTES`, `MAX_UPLOAD_BYTES`, `AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DATA_FILE`, `UPLOAD_DIR`
