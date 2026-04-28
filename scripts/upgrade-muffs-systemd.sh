#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE_NAME="${SERVICE_NAME:-nanobot}"
BRANCH="${BRANCH:-main}"
VENV_DIR="${VENV_DIR:-.venv}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
SKIP_WEBUI_BUILD="${SKIP_WEBUI_BUILD:-0}"
SKIP_INSTALL="${SKIP_INSTALL:-0}"

log() {
  printf '\n==> %s\n' "$*"
}

die() {
  printf '\nERROR: %s\n' "$*" >&2
  exit 1
}

run_systemctl() {
  if [[ "$(id -u)" == "0" ]]; then
    systemctl "$@"
  else
    sudo systemctl "$@"
  fi
}

git_relevant_status() {
  git status --porcelain -- \
    . \
    ":(exclude)$VENV_DIR" \
    ":(exclude)webui/node_modules" \
    ":(exclude)nanobot/web/dist"
}

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || die "Run this from inside the nanobot git repo."
cd "$repo_root"

log "Repository"
printf 'Path: %s\n' "$repo_root"
printf 'Host: %s\n' "$(hostname)"
printf 'Branch: %s\n' "$(git branch --show-current)"

if [[ -n "$(git_relevant_status)" ]]; then
  git_relevant_status
  die "Working tree has local changes. Commit, stash, or remove them before upgrading."
fi

log "Fetching origin"
git fetch origin

current_branch="$(git branch --show-current)"
if [[ "$current_branch" != "$BRANCH" ]]; then
  die "Current branch is '$current_branch', expected '$BRANCH'. Set BRANCH=$current_branch if this is intentional."
fi

local_sha="$(git rev-parse HEAD)"
remote_sha="$(git rev-parse "origin/$BRANCH")"

if [[ "$local_sha" == "$remote_sha" ]]; then
  log "Repo already matches origin/$BRANCH"
else
  log "Pulling origin/$BRANCH with fast-forward only"
  git pull --ff-only origin "$BRANCH"
fi

if [[ "$SKIP_WEBUI_BUILD" != "1" && -d webui ]]; then
  log "Building WebUI"
  cd "$repo_root/webui"
  if command -v npm >/dev/null 2>&1; then
    if [[ -f package-lock.json ]]; then
      npm ci
    else
      npm install
    fi
    npm run build
  elif command -v bun >/dev/null 2>&1; then
    bun install
    bun run build
  else
    die "Neither npm nor bun is available; install Node.js/npm or bun to build the WebUI."
  fi
  cd "$repo_root"
fi

if [[ "$SKIP_INSTALL" != "1" ]]; then
  log "Installing Python package into $VENV_DIR"
  if [[ ! -x "$VENV_DIR/bin/python" ]]; then
    "$PYTHON_BIN" -m venv "$VENV_DIR"
  fi
  "$VENV_DIR/bin/python" -m pip install -U pip
  "$VENV_DIR/bin/python" -m pip install -e .
fi

log "Restarting systemd service: $SERVICE_NAME"
run_systemctl restart "$SERVICE_NAME"

log "Service status"
run_systemctl --no-pager --full status "$SERVICE_NAME"

log "Recent logs"
journalctl -u "$SERVICE_NAME" -n 80 --no-pager

log "Upgrade complete"
