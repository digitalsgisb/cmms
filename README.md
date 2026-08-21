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
