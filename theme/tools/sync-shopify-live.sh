#!/usr/bin/env bash
# Sync theme/ from the current branch onto the shopify-live branch root.
#
# Shopify's GitHub integration deploys every push to shopify-live AND commits
# theme-editor changes back to it. That two-way traffic is what every safeguard
# in this script exists for:
#
#   - The Shopify side OWNS config/settings_data.json, every templates/*.json,
#     and sections/header-group.json / footer-group.json. Those files hold the
#     merchant's editor work: section order, block content, per-block settings,
#     the palette, the uploaded importer seals. All of them are restored after the
#     rsync, not just settings_data.json — exempting that one file only meant
#     `rsync --delete` overwrote the owner's homepage tile and photo-layout
#     choices in templates/index.json and pushed the loss to the live theme with
#     no warning and no separate backup.
#
#   - Deploy from HEAD, not from the working tree, and refuse to run dirty. The
#     rsync used to read theme/ on disk while the commit message quoted HEAD's
#     SHA, and nothing checked that the two agreed — so an uncommitted "let me
#     just try it live" edit was deployed inside a commit whose tree does not
#     contain it. The deployed source then existed in no reachable commit, and
#     rolling back or bisecting the storefront against dev history was impossible.
#
#   - NEVER force-push. The whole premise is that the editor commits here, so
#     force-pushing is how you destroy those commits (and --force-with-lease would
#     not protect you: a pull refreshes the lease ref). Align the local branch to
#     the remote before starting, and answer a rejected push by re-applying on top
#     of the new tip. The previous version aborted under `set -e` while the EXIT
#     trap deleted the worktree, leaving the local branch holding an unpushed
#     commit that made every later run fail on `pull --ff-only`, with no visible
#     working copy to explain why.
set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)
BRANCH=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)
HEAD_SHA=$(git -C "$REPO_ROOT" rev-parse --short HEAD)

# Files the Shopify side owns. Anything listed here is restored from
# shopify-live after the rsync. Paths are relative to the theme root.
SHOPIFY_OWNED=(
  "config/settings_data.json"
  "templates"
  "sections/header-group.json"
  "sections/footer-group.json"
)

die() {
  echo "sync-shopify-live: $*" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# 1. Refuse to deploy anything that is not committed.
# ---------------------------------------------------------------------------
# --porcelain covers untracked files too, which `git diff --quiet` misses and
# which rsync would happily deploy.
if [ -n "$(git -C "$REPO_ROOT" status --porcelain -- theme)" ]; then
  git -C "$REPO_ROOT" status --short -- theme >&2
  die "theme/ has uncommitted changes. Commit them first — the deploy commit records $HEAD_SHA and must actually contain what it ships."
fi

python3 "$REPO_ROOT/theme/tools/validate.py"

# ---------------------------------------------------------------------------
# 2. Align the local shopify-live branch to the remote before touching it.
# ---------------------------------------------------------------------------
fetch_live() {
  local attempt
  for attempt in 1 2 3 4; do
    if git -C "$REPO_ROOT" fetch origin shopify-live; then
      return 0
    fi
    echo "sync-shopify-live: fetch failed, retrying in $((2 ** attempt))s" >&2
    sleep "$((2 ** attempt))"
  done
  die "could not fetch origin/shopify-live"
}

fetch_live

WT=$(mktemp -d)
SYNC_FAILED=1
cleanup() {
  # Report before destroying the worktree, so a failure leaves an explanation
  # rather than a bare non-fast-forward message from a directory that is gone.
  if [ -n "${SYNC_FAILED:-}" ]; then
    echo "sync-shopify-live: FAILED. local shopify-live = $(git -C "$REPO_ROOT" rev-parse --short shopify-live 2>/dev/null || echo unknown), origin/shopify-live = $(git -C "$REPO_ROOT" rev-parse --short origin/shopify-live 2>/dev/null || echo unknown). Nothing was force-pushed. Re-run — the script re-aligns to the remote on every start." >&2
  fi
  git -C "$REPO_ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# -B resets the local branch to the remote tip. Safe precisely because this
# script never keeps local-only commits: everything it commits is pushed in the
# same run, and anything it failed to push is reproduced by re-running it.
git -C "$REPO_ROOT" worktree add -B shopify-live "$WT" origin/shopify-live >/dev/null

# ---------------------------------------------------------------------------
# 3. Copy the deployable theme from HEAD, then hand the Shopify-owned files back.
# ---------------------------------------------------------------------------
apply_theme() {
  local staging path
  staging=$(mktemp -d)
  # From HEAD, not the working tree — see the header.
  git -C "$REPO_ROOT" archive "$HEAD_SHA" theme \
    | tar -x -C "$staging" --strip-components=1

  rsync -a --delete \
    "$staging/assets" "$staging/config" "$staging/layout" \
    "$staging/locales" "$staging/sections" "$staging/snippets" \
    "$staging/templates" "$WT/"
  rm -rf "$staging"

  # Restore everything the theme editor owns. `git checkout HEAD --` inside the
  # worktree is exact: a path the editor created that this branch does not have
  # comes back, and a path that does not exist upstream is skipped.
  for path in "${SHOPIFY_OWNED[@]}"; do
    if git -C "$WT" cat-file -e "HEAD:$path" 2>/dev/null; then
      git -C "$WT" checkout HEAD -- "$path"
    fi
  done
}

apply_theme

stage_commit() {
  git -C "$WT" add -A
  if git -C "$WT" diff --cached --quiet; then
    return 1
  fi
  git -C "$WT" commit -q -m "Sync theme from $BRANCH @ $HEAD_SHA"
  return 0
}

if ! stage_commit; then
  # Not necessarily "nothing to do": a previous run may have committed and failed
  # to push, in which case reporting success would hide an undeployed change.
  if [ "$(git -C "$WT" rev-parse HEAD)" = "$(git -C "$REPO_ROOT" rev-parse origin/shopify-live)" ]; then
    SYNC_FAILED=""
    echo "shopify-live is already up to date"
    exit 0
  fi
  echo "sync-shopify-live: content matches but shopify-live is ahead of origin — pushing"
fi

# ---------------------------------------------------------------------------
# 4. Push, and on rejection re-align and re-apply rather than forcing.
# ---------------------------------------------------------------------------
for attempt in 1 2 3; do
  if git -C "$WT" push origin HEAD:shopify-live; then
    SYNC_FAILED=""
    echo "synced shopify-live to $BRANCH @ $HEAD_SHA — Shopify will pick it up in moments"
    exit 0
  fi

  echo "sync-shopify-live: push rejected (attempt $attempt) — the theme editor probably committed. Re-applying on top of the new tip." >&2
  fetch_live
  git -C "$WT" reset --hard origin/shopify-live >/dev/null
  apply_theme
  if ! stage_commit; then
    SYNC_FAILED=""
    echo "shopify-live already carries this theme"
    exit 0
  fi
done

die "push to shopify-live kept being rejected. Nothing was force-pushed and no editor work was lost; re-run once the theme editor is idle."
