#!/usr/bin/env bash
set -Eeuo pipefail

# =========================
# Clone Instagram Deployment
# =========================

APP_DIR="/var/www/node-project/clone-insta"
REPO_URL="https://github.com/vipul1235677888/clone-insta.git"
BRANCH="main"
APP_NAME="clone-insta"
APP_URL="http://127.0.0.1:5000/"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

fail() {
    log "ERROR: $*"
    exit 1
}

# 1. Check required commands
log "Checking required software..."

for cmd in git node npm pm2 curl; do
    command -v "$cmd" >/dev/null 2>&1 ||
        fail "$cmd is not installed or is not available in PATH."
done

# 2. Move to project directory
cd "$APP_DIR" || fail "Project directory not found: $APP_DIR"

# 3. Verify Git repository and remote
git rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
    fail "This directory is not a Git repository."

CURRENT_REMOTE="$(git remote get-url origin)" ||
    fail "Git remote 'origin' is not configured."

if [[ "$CURRENT_REMOTE" != "$REPO_URL" ]]; then
    fail "Unexpected Git remote: $CURRENT_REMOTE"
fi

# 4. Protect tracked local changes
if ! git diff --quiet || ! git diff --cached --quiet; then
    fail "Tracked local changes found. Commit or safely back them up before deploying."
fi

# 5. Fetch latest code from GitHub
log "Fetching latest code from GitHub..."
git fetch origin "$BRANCH" ||
    fail "Could not fetch branch '$BRANCH'. Check your GitHub access."

# 6. Switch to the deployment branch if necessary
CURRENT_BRANCH="$(git branch --show-current)"

if [[ "$CURRENT_BRANCH" != "$BRANCH" ]]; then
    log "Switching to branch '$BRANCH'..."

    if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
        git switch "$BRANCH" ||
            fail "Could not switch to '$BRANCH'."
    else
        git switch --track -c "$BRANCH" "origin/$BRANCH" ||
            fail "Could not create local branch '$BRANCH'."
    fi
fi

# 7. Apply GitHub changes using a fast-forward only
log "Updating project code..."
git merge --ff-only "origin/$BRANCH" ||
    fail "Cannot safely update the branch. Resolve Git divergence before deploying."

log "Code updated successfully."

# 8. Install dependencies
log "Installing Node.js dependencies..."

if [[ -f package-lock.json ]]; then
    npm ci
else
    npm install
fi

# 9. Run build only if a build script exists
if node -e "process.exit(require('./package.json').scripts?.build ? 0 : 1)"; then
    log "Building application..."
    npm run build
fi

# 10. Verify existing PM2 application
pm2 describe "$APP_NAME" >/dev/null 2>&1 ||
    fail "PM2 application '$APP_NAME' was not found. Check your PM2 setup."

# 11. Restart application and load updated environment
log "Restarting application '$APP_NAME'..."
pm2 reload "$APP_NAME" --update-env ||
    fail "PM2 reload failed. Check 'pm2 logs $APP_NAME'."

# 12. Wait for application to respond
log "Checking application health..."

HEALTHY=0

for attempt in $(seq 1 15); do
    if curl --silent --show-error --fail \
        --output /dev/null "$APP_URL" 2>/dev/null; then
        HEALTHY=1
        break
    fi

    sleep 2
done

if [[ "$HEALTHY" -ne 1 ]]; then
    log "WARNING: Application did not return a successful HTTP response."
    log "Check application logs with: pm2 logs $APP_NAME"
    exit 1
fi

# 13. Save PM2 process list
pm2 save

log "=========================================="
log "DEPLOYMENT SUCCESSFUL"
log "Project: $APP_DIR"
log "Branch: $BRANCH"
log "Application: $APP_NAME"
log "URL: $APP_URL"
log "=========================================="
