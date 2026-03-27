# Soci MVP Deployment (Vercel + Hostinger + Cloudflare, Free-Tier First)

## 1) Architecture

- **Frontend**: Vercel (static site) — auto-deploys from GitHub on every push to `main`
- **API**: Hostinger VPS (Node + Nginx reverse proxy) — auto-deploys via GitHub Actions on every push to `main`
- **DNS/SSL/WAF**: Cloudflare

Recommended domains:

- `app.yourdomain.com` → Vercel
- `api.yourdomain.com` → Hostinger VPS

---

## 2) GitHub Setup (do this first)

### Create repo and push

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/soci.git
git push -u origin main
```

> `.gitignore` already excludes `.env`, `backend/data/db.json`, and `backend/uploads/` — these live on the VPS only.

### Add GitHub secrets for auto-deploy (Settings → Secrets and variables → Actions)

| Secret | Value |
| --- | --- |
| `VPS_HOST` | Your Hostinger VPS IP address |
| `VPS_USER` | SSH username (e.g. `root` or `ubuntu`) |
| `VPS_SSH_KEY` | Private key from the step below |

### Generate a deploy SSH key on your VPS

```bash
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/github_deploy
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/github_deploy   # copy this — paste it as VPS_SSH_KEY in GitHub secrets
```

Once secrets are set, every `git push origin main` will:

1. Auto-deploy the frontend via Vercel
2. SSH into the VPS, `git pull`, and restart the API via GitHub Actions (`.github/workflows/deploy.yml`)

---

## 3) Backend (Hostinger VPS)

### Install runtime
```bash
sudo apt update
sudo apt install -y nodejs npm nginx
sudo npm install -g pm2
```

### App setup
```bash
sudo mkdir -p /var/www/soci
sudo chown -R $USER:$USER /var/www/soci
cd /var/www/soci
# clone your repo, then:
npm install
cp .env.example .env
```

Edit `.env` with production values (especially `AUTH_SECRET`, `ADMIN_PASSWORD`, and URLs).

### Start API with PM2
```bash
pm2 start backend/server.js --name soci-api
pm2 save
pm2 startup
```

### Nginx reverse proxy
Create `/etc/nginx/sites-available/soci-api`:

```nginx
server {
  listen 80;
  server_name api.yourdomain.com;

  location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Enable and reload:
```bash
sudo ln -s /etc/nginx/sites-available/soci-api /etc/nginx/sites-enabled/soci-api
sudo nginx -t
sudo systemctl reload nginx
```

---

## 3) Frontend (Vercel)
- Import repo in Vercel
- Framework preset: **Other** (static)
- Output: repository root
- Bind custom domain: `app.yourdomain.com`

Frontend will call API at `https://api.yourdomain.com` (prompted at first login unless already set in local storage).

---

## 4) Cloudflare
1. Add domain to Cloudflare
2. DNS records:
   - `app` CNAME → your Vercel target
   - `api` A → Hostinger VPS IP
3. Enable orange-cloud proxy for both
4. SSL/TLS mode: **Full (strict)**
5. Enable **Always Use HTTPS**

---

## 5) Backups + Restore Verification (critical)

Soci now supports **verifiable backups** with:
- `db.json` JSON validation before archive
- `manifest.json` including sha256 checksums for DB + uploads
- optional post-backup replication hook (`POST_BACKUP_HOOK`)

Backup-related env vars:
- `BACKUP_DIR` (default `/backups`)
- `BACKUP_DATA_FILE` (should match live `DATA_FILE`)
- `BACKUP_UPLOAD_DIR` (should match live `UPLOAD_DIR`)
- `BACKUP_MANIFEST_VERSION` (default `1`)

### Recommended cron schedule

Nightly backup:
```bash
0 2 * * * APP_DIR=/var/www/soci BACKUP_DIR=/var/www/soci/backups BACKUP_DATA_FILE=/data/db.json BACKUP_UPLOAD_DIR=/uploads /var/www/soci/scripts/backup.sh >> /var/www/soci/backup.log 2>&1
```

Weekly backup verification drill (latest archive):
```bash
0 3 * * 0 /bin/bash -lc 'latest=$(ls -1t /var/www/soci/backups/soci-backup-*.tar.gz | head -n1) && /var/www/soci/scripts/verify-backup.sh "$latest"' >> /var/www/soci/backup-verify.log 2>&1
```

Weekly live storage integrity scan:
```bash
15 3 * * 0 /bin/bash -lc 'DATA_FILE=/data/db.json UPLOAD_DIR=/uploads node /var/www/soci/scripts/check-storage-integrity.mjs' >> /var/www/soci/storage-integrity.log 2>&1
```

### Manual commands

Create backup:
```bash
APP_DIR=/var/www/soci BACKUP_DIR=/var/www/soci/backups BACKUP_DATA_FILE=/data/db.json BACKUP_UPLOAD_DIR=/uploads /var/www/soci/scripts/backup.sh
```

Verify a backup archive:
```bash
/var/www/soci/scripts/verify-backup.sh /var/www/soci/backups/soci-backup-YYYYMMDD-HHMMSS.tar.gz
```

Scan live DB/uploads consistency:
```bash
DATA_FILE=/data/db.json UPLOAD_DIR=/uploads node /var/www/soci/scripts/check-storage-integrity.mjs
```

> Keep at least one off-host copy (via `POST_BACKUP_HOOK`) to avoid single-server disaster loss.

---

## 6) Go-live smoke checks
```bash
curl -s https://api.yourdomain.com/health
```

In browser (`https://app.yourdomain.com`):
1. Login as admin
2. Create client
3. Create/edit post
4. Upload media
5. Generate share link
6. Open share link in incognito and verify read-only calendar
