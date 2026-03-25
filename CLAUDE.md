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
| `backend/server.js` | All API endpoints (login, clients, posts, media, share links, file serving) |
| `backend/db.js` | JSON persistence — atomic writes via tmp+rename, write queue for concurrency |
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
- `saveState()` in `db.js` uses atomic write (tmp + rename) and a write queue — do not bypass this

## Env vars (see .env.example)
`PORT`, `APP_BASE_URL`, `API_BASE_URL`, `CORS_ORIGINS`, `MAX_JSON_BYTES`, `MAX_UPLOAD_BYTES`, `AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DATA_FILE`, `UPLOAD_DIR`
