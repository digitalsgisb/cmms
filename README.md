# Sugi CMMS System

A learning-friendly CMMS foundation using:

- React + TypeScript PWA frontend
- Node/Express API backend
- SQLite database through Node 24's built-in `node:sqlite`
- Local server upload storage

## How To Run

Install dependencies:

```powershell
pnpm install
```

Start both API and web app:

```powershell
pnpm dev
```

Default local URLs:

- Web app: http://localhost:5173
- API health: http://localhost:3300/api/health

## GitHub: Pull and Push Updates

Run these commands from the project folder. The main branch for this project is `main`.

### Pull the latest update

Before starting work, check that you do not have unfinished changes:

```powershell
git status
```

Then download and apply the latest version from GitHub:

```powershell
git pull --rebase origin main
pnpm install
```

Run `pnpm install` after pulling because an update may add or change a dependency. Start the updated app with:

```powershell
pnpm dev
```

### Push your changes

Review the changed files:

```powershell
git status
git diff
```

Add the files, create a commit, and push it to GitHub:

```powershell
git add .
git commit -m "Describe what was changed"
git pull --rebase origin main
git push origin main
```

The second pull checks for updates made by someone else before your push. Do not use `git add .` if the status shows files that should not be included; add only the required paths instead, for example `git add README.md`.

If Git reports a conflict, do not force-push. Open each conflicted file, choose the correct content, and then continue:

```powershell
git add <fixed-file>
git rebase --continue
git push origin main
```

To cancel the conflicted rebase and return to the state before the pull:

```powershell
git rebase --abort
```

### Update the existing production Docker deployment on the Atom PC

The current Sugi CMMS production server uses these locations:

- App repository: `/srv/apps/cmms`
- Compose file: `/srv/apps/cmms/docker-compose.yml`
- SQLite data: `/srv/app-data/cmms/data`
- Uploaded images: `/srv/app-data/cmms/uploads`
- Container: `sugi-cmms`
- Port: `3300`

The repository also contains a default `compose.yaml` for fresh installations. On this existing server, always include `-f docker-compose.yml` so Docker uses the production bind mounts above and does not accidentally start a separate empty installation.

First, check that the repository has no unfinished local changes:

```bash
cd /srv/apps/cmms
git status
git remote -v
git branch --show-current
```

Before an update, make a timestamped backup. The short stop ensures the SQLite file is copied consistently:

```bash
backup_file="/srv/app-data/cmms-backup-$(date +%Y%m%d-%H%M%S).tar.gz"

docker stop sugi-cmms
sudo tar -czf "$backup_file" -C /srv/app-data/cmms data uploads
docker start sugi-cmms

echo "Backup saved to: $backup_file"
```

Pull the latest code, rebuild the image, and recreate the container using the existing production configuration:

```bash
cd /srv/apps/cmms
git pull --ff-only origin main
docker compose -f docker-compose.yml up -d --build --remove-orphans
docker compose -f docker-compose.yml ps
docker compose -f docker-compose.yml logs --tail=100 cmms
curl http://localhost:3300/api/health
```

The bind-mounted database and uploads remain in `/srv/app-data/cmms` when the container is rebuilt. Do not delete that directory. Also avoid `docker compose down -v` because it can delete Docker-managed volumes in other Compose configurations.

Useful commands for this production deployment:

```bash
# Follow app logs
docker compose -f /srv/apps/cmms/docker-compose.yml logs -f --tail=100 cmms

# Restart without rebuilding
docker compose -f /srv/apps/cmms/docker-compose.yml restart cmms

# Check the API
curl http://localhost:3300/api/health

# Stop and start while retaining the bind-mounted data
docker compose -f /srv/apps/cmms/docker-compose.yml stop cmms
docker compose -f /srv/apps/cmms/docker-compose.yml start cmms
```

### Update the Raspberry Pi deployment

After pushing an update, run these commands on the Raspberry Pi:

```bash
cd /opt/sugi-cmms
git pull --ff-only origin main
corepack pnpm install --frozen-lockfile
corepack pnpm build
sudo systemctl restart sugi-cmms
sudo systemctl status sugi-cmms --no-pager
```

## Docker Install on a Linux Atom PC

This repository includes a production `Dockerfile` and `compose.yaml`. The Docker image uses Node.js 24 and serves both the API and built website on port `3300`.

Install Docker Engine with the official instructions for your Linux distribution, including the Docker Compose plugin. Confirm that both commands work:

```bash
docker --version
docker compose version
```

Clone and start Sugi CMMS:

```bash
sudo mkdir -p /opt/sugi-cmms
sudo chown "$USER":"$USER" /opt/sugi-cmms
git clone https://github.com/digitalsgisb/cmms.git /opt/sugi-cmms
cd /opt/sugi-cmms
docker compose up -d --build
```

Open the application from another device on the same network:

- CMMS: `http://<atom-pc-ip>:3300`
- API health: `http://<atom-pc-ip>:3300/api/health`

Find the Atom PC's IP address with:

```bash
hostname -I
```

If port `3300` is already used, create a `.env` file beside `compose.yaml` with another host port:

```dotenv
CMMS_PORT=8080
```

Then recreate the container and open `http://<atom-pc-ip>:8080`:

```bash
docker compose up -d
```

### Back up Docker data

Stop the app briefly so the SQLite backup is consistent, copy both persistent folders, and start it again:

```bash
cd /opt/sugi-cmms
backup_dir="backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup_dir"
docker compose stop cmms
docker compose cp cmms:/app/apps/api/data "$backup_dir/data"
docker compose cp cmms:/app/apps/api/uploads "$backup_dir/uploads"
docker compose start cmms
```

Keep the resulting `backups/<date-time>` folder somewhere safe outside the Atom PC as well.

## Raspberry Pi Service Install

This app requires Node.js 24 or newer because the API uses `node:sqlite`. The installer below installs Node.js Current from NodeSource if the Pi does not already have Node.js 24+.

On the Raspberry Pi, clone and install the service with:

```bash
sudo apt-get update
sudo apt-get install -y git
sudo install -d -o "$USER" -g "$USER" /opt/sugi-cmms
git clone https://github.com/digitalsgisb/cmms.git /opt/sugi-cmms
cd /opt/sugi-cmms
bash deploy/install-pi.sh
```

The installer creates a `sugi-cmms` systemd service that runs the production build on port `3300`.

Useful service commands:

```bash
sudo systemctl status sugi-cmms --no-pager
sudo journalctl -u sugi-cmms -f
sudo systemctl restart sugi-cmms
```

After install, open:

- CMMS: http://<raspberry-pi-ip>:3300
- API health: http://<raspberry-pi-ip>:3300/api/health

## Learning Path

The app is split into three layers:

- `packages/shared`: common TypeScript types used by both frontend and backend.
- `apps/api`: Express API, SQLite database, uploads, work order workflow, notifications.
- `apps/web`: React PWA interface for requesters, technicians, executives, and TV dashboard.

The first real feature is Work Orders. Other CMMS areas are included as placeholder pages so the system already has a proper product shape.
