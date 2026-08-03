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

# Files the Shopify side owns, restored from shopify-live after the rsync.
#
# Listed as FILE patterns, never as bare directories. `templates` as a directory
# reverted everything under it, including templates/gift_card.liquid and
# templates/search.quick-order.liquid — hand-written Liquid the theme editor never
# touches — so those two, and any repo-side edit to a JSON template, became
# permanently un-deployable while the script still printed success. Only the JSON
# templates carry editor state (section order, block content, per-block settings).
SHOPIFY_OWNED_GLOBS=(
  "config/settings_data.json"
  "sections/header-group.json"
  "sections/footer-group.json"
  "templates/*.json"
  "templates/customers/*.json"
)

die() {
  echo "sync-shopify-live: $*" >&2
  exit 1
}

# Fail on a missing dependency before touching any branch, rather than half-way
# through with a worktree already created.
for tool in rsync tar python3; do
  command -v "$tool" >/dev/null || die "$tool is required but not installed"
done

# ---------------------------------------------------------------------------
# 1. Refuse to deploy anything that is not committed.
# ---------------------------------------------------------------------------
# --porcelain covers untracked files too, which `git diff --quiet` misses and
# which rsync would happily deploy.
if [ -n "$(git -C "$REPO_ROOT" status --porcelain -- theme)" ]; then
  git -C "$REPO_ROOT" status --short -- theme >&2
  die "theme/ has uncommitted changes. Commit them first — the deploy commit records $HEAD_SHA and must actually contain what it ships."
fi

# --strict, the same gate CI applies. The deploy path protects the LIVE store, so
# it must not be the weaker of the two.
python3 "$REPO_ROOT/theme/tools/validate.py" --strict

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
  # `worktree remove` cannot delete a path git never registered — which is exactly
  # what happens when `worktree add` itself fails (e.g. shopify-live is already
  # checked out elsewhere). Without the rm every aborted run leaked a mktemp dir.
  git -C "$REPO_ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true
  rm -rf "$WT"
  git -C "$REPO_ROOT" worktree prune >/dev/null 2>&1 || true
}
trap cleanup EXIT

# -B resets the local branch to the remote tip. Safe precisely because this
# script never keeps local-only commits: everything it commits is pushed in the
# same run, and anything it failed to push is reproduced by re-running it.
git -C "$REPO_ROOT" worktree add -B shopify-live "$WT" origin/shopify-live >/dev/null

# ---------------------------------------------------------------------------
# 3. Copy the deployable theme from HEAD, then hand the Shopify-owned files back.
# ---------------------------------------------------------------------------
DISCARDED=0

apply_theme() {
  local staging pattern
  staging=$(mktemp -d)
  # From HEAD, not the working tree — see the header.
  git -C "$REPO_ROOT" archive "$HEAD_SHA" theme \
    | tar -x -C "$staging" --strip-components=1

  rsync -a --delete \
    "$staging/assets" "$staging/config" "$staging/layout" \
    "$staging/locales" "$staging/sections" "$staging/snippets" \
    "$staging/templates" "$WT/"
  rm -rf "$staging"

  # Restore everything the theme editor owns, and SAY SO when a repo-side change is
  # discarded in the process. Reverting silently is how a developer's edit to a JSON
  # template disappears inside a commit that reports success.
  #
  # The globs are expanded by git against the worktree (quoted pathspecs), not by
  # this shell against the repo cwd — otherwise they would match nothing.
  local before after owned
  for pattern in "${SHOPIFY_OWNED_GLOBS[@]}"; do
    # Every tracked path on shopify-live matching this pattern.
    while IFS= read -r owned; do
      [ -n "$owned" ] || continue
      before=""
      [ -f "$WT/$owned" ] && before=$(git -C "$WT" hash-object "$WT/$owned")
      git -C "$WT" checkout HEAD -- "$owned"
      after=$(git -C "$WT" hash-object "$WT/$owned")
      if [ -n "$before" ] && [ "$before" != "$after" ]; then
        echo "sync-shopify-live: NOT deployed — $owned is owned by the Shopify theme editor, so your repo change to it was reverted. Make that change in the theme editor instead." >&2
        DISCARDED=$((DISCARDED + 1))
      fi
    done < <(git -C "$WT" ls-files -- "$pattern")
  done
}

apply_theme

report_discarded() {
  if [ "$DISCARDED" -gt 0 ]; then
    echo "sync-shopify-live: $DISCARDED repo change(s) above were NOT deployed because the theme editor owns those files." >&2
  fi
}

stage_commit() {
  git -C "$WT" add -A
  if git -C "$WT" diff --cached --quiet; then
    return 1
  fi
  git -C "$WT" commit -q -m "Sync theme from $BRANCH @ $HEAD_SHA"
  return 0
}

if ! stage_commit; then
  # Genuinely nothing to do. There is no "local branch is ahead" case to rescue
  # here: the `worktree add -B` above resets to origin/shopify-live, which is
  # precisely how an orphaned unpushed commit from a previous failed run is
  # discarded — re-running from the dev branch is what reproduces it.
  SYNC_FAILED=""
  report_discarded
  echo "shopify-live is already up to date"
  exit 0
fi

# ---------------------------------------------------------------------------
# 4. Push, and on rejection re-align and re-apply rather than forcing.
# ---------------------------------------------------------------------------
for attempt in 1 2 3; do
  if git -C "$WT" push origin HEAD:shopify-live; then
    SYNC_FAILED=""
    report_discarded
    echo "synced shopify-live to $BRANCH @ $HEAD_SHA — pushed $(git -C "$WT" rev-parse --short HEAD) to origin/shopify-live."
    echo "Confirm it landed: the connected theme's \"last saved from GitHub\" timestamp should advance within a minute. If the branch is not connected to a theme, NOTHING was deployed — see HANDOFF §14."
    exit 0
  fi

  echo "sync-shopify-live: push rejected (attempt $attempt) — the theme editor probably committed. Re-applying on top of the new tip." >&2
  fetch_live
  git -C "$WT" reset --hard origin/shopify-live >/dev/null
  apply_theme
  if ! stage_commit; then
    SYNC_FAILED=""
    report_discarded
    echo "shopify-live already carries this theme"
    exit 0
  fi
done

die "push to shopify-live kept being rejected. Nothing was force-pushed and no editor work was lost; re-run once the theme editor is idle."
