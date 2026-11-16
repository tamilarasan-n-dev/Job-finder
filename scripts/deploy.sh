#!/usr/bin/env bash
# One-command deploy for a fresh Debian/Ubuntu VM (e.g. Google Cloud e2-micro).
# Run from the project folder:   bash scripts/deploy.sh
# Safe to re-run: it updates and restarts the container.
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }

# 1) Docker
if ! command -v docker >/dev/null 2>&1; then
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
fi
DOCKER="docker"
if ! docker info >/dev/null 2>&1; then DOCKER="sudo docker"; fi

# 2) Small swap file so the image build doesn't run out of memory on a 1 GB VM
if [ "$(free -m | awk '/^Mem:/{print $2}')" -lt 2000 ] && ! swapon --show | grep -q .; then
  say "Adding 1 GB swap (low-memory VM)"
  sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

# 3) .env
if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  say "Created .env — fill in SMTP + recipients, then run this script again:"
  echo "    nano .env"
  exit 1
fi
chmod 600 .env

# 4) Build
say "Building image"
$DOCKER compose build

# 5) Check job boards and SMTP before going live
say "Checking job boards (wrong slugs are listed; they're skipped, not fatal)"
$DOCKER compose run --rm job-finder verify || true

if [ "${SKIP_TEST_EMAIL:-0}" != "1" ]; then
  say "Sending a test email to MAIL_TO (set SKIP_TEST_EMAIL=1 to skip)"
  $DOCKER compose run --rm job-finder test-email
fi

# 6) Start
say "Starting the hourly job finder"
$DOCKER compose up -d
sleep 3
$DOCKER compose ps
say "Done. Follow logs with:  $DOCKER compose logs -f job-finder"
