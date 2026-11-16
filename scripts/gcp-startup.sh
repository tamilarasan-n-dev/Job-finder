#!/usr/bin/env bash
# Google Cloud VM startup script: deploys / updates job-finder on every boot,
# configured entirely from the console (no SSH needed).
#
# Setup (console → VM → Edit):
#   Metadata  (Custom metadata → Add item), keys:
#     jf-smtp-user     your SMTP login, e.g. you@gmail.com          (required)
#     jf-smtp-pass     SMTP password / Gmail App Password           (required)
#     jf-mail-to       main recipient(s), comma-separated           (required)
#     jf-mail-bcc      silent copy, e.g. you                        (optional)
#     jf-admin-email   failure alerts + daily check (default: bcc)  (optional)
#     jf-smtp-host     default smtp.gmail.com                       (optional)
#     jf-smtp-port     default 465                                  (optional)
#   Automation → Startup script:
#     curl -fsSL https://raw.githubusercontent.com/tamilarasan-n-dev/Job-finder/main/scripts/gcp-startup.sh | bash
# Then Save and press Reset (or Stop → Start). Every later reboot pulls the
# latest code and restarts. Progress: VM page → Logs → Serial port 1.
set -uo pipefail

APP_DIR="${JF_APP_DIR:-/opt/job-finder}"
REPO_URL="${JF_REPO_URL:-https://github.com/tamilarasan-n-dev/Job-finder.git}"
LOG=/var/log/job-finder-startup.log

log() { echo "[job-finder] $*" | tee -a "$LOG" >&2; }

# Read a custom metadata value (empty if unset). JF_FAKE_METADATA_DIR lets
# the script be tested off-GCP with one file per key.
md() {
  if [ -n "${JF_FAKE_METADATA_DIR:-}" ]; then
    cat "$JF_FAKE_METADATA_DIR/$1" 2>/dev/null || true
    return
  fi
  curl -fsS -H "Metadata-Flavor: Google" \
    "http://metadata.google.internal/computeMetadata/v1/instance/attributes/$1" 2>/dev/null || true
}

# .env values are single-quoted so docker compose doesn't expand $ or # in passwords.
q() {
  case "$1" in *"'"*) log "ERROR: a value contains a single quote ('), which isn't supported — change it"; exit 1 ;; esac
  printf "'%s'" "$1"
}

write_env() {
  local user pass to bcc admin host port
  user="$(md jf-smtp-user)"; pass="$(md jf-smtp-pass)"; to="$(md jf-mail-to)"
  bcc="$(md jf-mail-bcc)"; admin="$(md jf-admin-email)"
  host="$(md jf-smtp-host)"; port="$(md jf-smtp-port)"
  host="${host:-smtp.gmail.com}"; port="${port:-465}"; admin="${admin:-$bcc}"
  pass="${pass// /}"   # Gmail shows app passwords with spaces; SMTP wants them without

  local missing=()
  [ -z "$user" ] && missing+=(jf-smtp-user)
  [ -z "$pass" ] && missing+=(jf-smtp-pass)
  [ -z "$to" ] && missing+=(jf-mail-to)
  if [ ${#missing[@]} -gt 0 ]; then
    log "ERROR: missing VM metadata: ${missing[*]} — add them (VM → Edit → Metadata) and Reset the VM"
    exit 1
  fi

  umask 077
  cat > "$APP_DIR/.env" <<EOF
SMTP_HOST=$(q "$host")
SMTP_PORT=$(q "$port")
SMTP_USER=$(q "$user")
SMTP_PASS=$(q "$pass")
MAIL_FROM=$(q "Job Finder <$user>")
MAIL_TO=$(q "$to")
MAIL_BCC=$(q "$bcc")
ADMIN_EMAIL=$(q "$admin")
CRON_SCHEDULE='0 * * * *'
TZ='Asia/Kolkata'
RUN_ON_START='true'
HEARTBEAT_CRON='5 9 * * *'
EOF
  chmod 600 "$APP_DIR/.env"
  log ".env written (to=$to, bcc=${bcc:-none}, admin=${admin:-none}, smtp=$host:$port)"
}

# Test hook: only render .env, touch nothing else.
if [ "${JF_ONLY_ENV:-0}" = "1" ]; then
  mkdir -p "$APP_DIR"; write_env; exit 0
fi

log "startup $(date -Is)"

# 1) Packages + Docker
export DEBIAN_FRONTEND=noninteractive
if ! command -v git >/dev/null || ! command -v curl >/dev/null; then
  apt-get update -y && apt-get install -y git curl ca-certificates
fi
if ! command -v docker >/dev/null; then
  log "installing Docker…"
  curl -fsSL https://get.docker.com | sh || { log "ERROR: Docker install failed"; exit 1; }
fi
systemctl enable --now docker >/dev/null 2>&1 || true

# 2) Swap on small VMs so the build doesn't run out of memory
if [ "$(free -m | awk '/^Mem:/{print $2}')" -lt 2000 ] && ! swapon --show | grep -q .; then
  [ -f /swapfile ] || { fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null; }
  swapon /swapfile 2>/dev/null || true
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# 3) Code: clone first time, pull latest after that
if [ -d "$APP_DIR/.git" ]; then
  log "updating code…"
  git -C "$APP_DIR" pull --ff-only || log "WARN: git pull failed — keeping current version"
else
  log "cloning $REPO_URL…"
  rm -rf "$APP_DIR"
  git clone --depth 1 "$REPO_URL" "$APP_DIR" || { log "ERROR: clone failed"; exit 1; }
fi
log "code at $(git -C "$APP_DIR" rev-parse --short HEAD)"

# 4) Settings from metadata (re-written every boot, so edits apply on Reset)
write_env

# 5) Build + start
cd "$APP_DIR"
log "building image (first time takes a few minutes)…"
docker compose build 2>&1 | tail -5 | tee -a "$LOG" >&2 || { log "ERROR: build failed"; exit 1; }

log "checking job boards:"
docker compose run --rm job-finder verify 2>&1 | tee -a "$LOG" >&2 || true

if [ ! -f "$APP_DIR/.test-email-sent" ]; then
  log "sending one-time test email…"
  if docker compose run --rm job-finder test-email 2>&1 | tee -a "$LOG" >&2; then
    touch "$APP_DIR/.test-email-sent"
  else
    log "ERROR: test email failed — check jf-smtp-* metadata (Gmail needs an App Password, port 465)"
  fi
fi

docker compose up -d 2>&1 | tee -a "$LOG" >&2
log "running ✔  (hourly, IST). Logs: sudo docker compose -f $APP_DIR/docker-compose.yml logs -f"
