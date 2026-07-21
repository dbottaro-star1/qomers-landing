#!/usr/bin/env bash
#
# Deploy the landing page to the Hostinger VPS.
#
# Publishes the contents of a *committed ref* (default: origin/main), never the
# working tree. Uncommitted edits and a stale local checkout cannot reach
# production. See DEPLOY.md.
#
#   ./deploy.sh              # dry run against origin/main — shows what would change
#   ./deploy.sh --apply      # actually deploy
#   ./deploy.sh --apply v2   # deploy some other ref (tag, branch, commit)

set -euo pipefail

REMOTE_HOST="hostinger"
REMOTE_DIR="/var/www/qomers-landing/current"
SITE_URL="https://qomers.com"

APPLY=0
[ "${1:-}" = "--apply" ] && { APPLY=1; shift; }
REF="${1:-origin/main}"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# origin/main is only as fresh as the last fetch.
git fetch --quiet origin
git rev-parse --verify --quiet "$REF" >/dev/null || { echo "error: unknown ref '$REF'" >&2; exit 1; }

echo "Deploying $REF ($(git rev-parse --short "$REF")) -> $REMOTE_HOST:$REMOTE_DIR"

# Warn when the working tree differs from what is about to ship. Not fatal —
# shipping origin/main with local edits present is legitimate — but it explains
# why a just-made change might not appear on the live site.
if ! git diff --quiet "$REF" -- . ':!DEPLOY.md' ':!deploy.sh' ':!.gitignore' ':!.gitattributes' 2>/dev/null; then
  echo "note: working tree differs from $REF; those differences will NOT be deployed"
fi

# git archive emits only committed, non-export-ignored files, so .git/ can never
# reach the webroot.
git archive "$REF" | tar -x -C "$STAGE"

# Cache-busting: stamp the css/js references in index.html with the commit hash
# so browsers always fetch the new files after a deploy (no stale cache). The
# repo's index.html stays clean; only the deployed copy gets the ?v=<hash>.
VER="$(git rev-parse --short "$REF")"
if [ -f "$STAGE/index.html" ]; then
  sed -i.bak -E "s|(href=\"css/styles\.css)\"|\1?v=$VER\"|; s|(src=\"js/main\.js)\"|\1?v=$VER\"|" "$STAGE/index.html"
  rm -f "$STAGE/index.html.bak"
  echo "cache-bust: stamped css/js with ?v=$VER"
fi

if [ "$APPLY" -eq 0 ]; then
  echo
  echo "--- DRY RUN (pass --apply to deploy) ---"
  rsync -avzn --delete --itemize-changes "$STAGE/" "$REMOTE_HOST:$REMOTE_DIR/"
  exit 0
fi

rsync -avz --delete "$STAGE/" "$REMOTE_HOST:$REMOTE_DIR/"

# rsync -a preserves the local uid/gid; nginx needs www-data.
ssh "$REMOTE_HOST" "
  chown -R www-data:www-data '$REMOTE_DIR'
  find '$REMOTE_DIR' -type d -exec chmod 755 {} \;
  find '$REMOTE_DIR' -type f -exec chmod 644 {} \;
"

# Verify the bytes actually being served match what we shipped.
echo
echo "--- verify ---"
fail=0
while IFS= read -r f; do
  want=$(shasum -a 256 "$STAGE/$f" | cut -d' ' -f1)
  got=$(curl -fsS "$SITE_URL/$f" | shasum -a 256 | cut -d' ' -f1)
  if [ "$want" = "$got" ]; then
    echo "  ok    $f"
  else
    echo "  FAIL  $f (served $got, expected $want)"
    fail=1
  fi
done < <(cd "$STAGE" && find . -type f | sed 's|^\./||')

[ "$fail" -eq 0 ] && echo "Deployed $(git rev-parse --short "$REF")." || { echo "Deploy verification FAILED." >&2; exit 1; }
