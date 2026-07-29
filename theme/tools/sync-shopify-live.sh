#!/usr/bin/env bash
# Sync theme/ from the current branch onto the shopify-live branch root.
# Shopify's GitHub integration deploys every push to shopify-live and commits
# theme-editor changes BACK to it, so:
#   - always pull first (the editor may have added commits), and
#   - never overwrite config/settings_data.json from here — once connected,
#     that file is owned by the Shopify side (the editor's saves land there).
set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)
BRANCH=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)
HEAD_SHA=$(git -C "$REPO_ROOT" rev-parse --short HEAD)

python3 "$REPO_ROOT/theme/tools/validate.py"

WT=$(mktemp -d)
git -C "$REPO_ROOT" worktree add "$WT" shopify-live >/dev/null
trap 'git -C "$REPO_ROOT" worktree remove --force "$WT" >/dev/null' EXIT

git -C "$WT" pull --ff-only

rsync -a --delete \
  "$REPO_ROOT/theme/assets" "$REPO_ROOT/theme/config" "$REPO_ROOT/theme/layout" \
  "$REPO_ROOT/theme/locales" "$REPO_ROOT/theme/sections" "$REPO_ROOT/theme/snippets" \
  "$REPO_ROOT/theme/templates" "$WT/"

# Restore the Shopify-owned settings file to whatever the editor last saved.
git -C "$WT" checkout -- config/settings_data.json 2>/dev/null || true

git -C "$WT" add -A
if git -C "$WT" diff --cached --quiet; then
  echo "shopify-live is already up to date"
  exit 0
fi

git -C "$WT" commit -m "Sync theme from $BRANCH @ $HEAD_SHA"
git -C "$WT" push
echo "synced shopify-live to $BRANCH @ $HEAD_SHA — Shopify will pick it up in moments"
