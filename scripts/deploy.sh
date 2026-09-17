#!/usr/bin/env bash
# Deploys one app to its Vercel project. Vercel builds from the repo root and each project's
# Root Directory picks the app, so workspace packages (`@morrow/ui`, `@morrow/sdk`) upload too.
# Env vars live on the Vercel projects, never in local files: .vercelignore keeps .env out.
set -euo pipefail

usage() {
  echo "usage: scripts/deploy.sh <app|landing> [--prod]" >&2
  exit 1
}

[ $# -ge 1 ] || usage
target=$1
shift

# IDs rather than the .vercel link, which only holds one project for the whole repo
export VERCEL_ORG_ID=team_CbCANtGBFedAwjdYkwHPJ1GS
case $target in
  app) export VERCEL_PROJECT_ID=prj_IYJfvONto5BU2cgj9pQL2Rr4tUIt ;;
  landing) export VERCEL_PROJECT_ID=prj_zdpohPmSVqrZriiKYM9dkmN04ETx ;;
  *) usage ;;
esac

args=()
for arg in "$@"; do
  case $arg in
    --prod) args+=(--prod) ;;
    *) usage ;;
  esac
done

if command -v vercel >/dev/null 2>&1; then
  cli=(vercel)
else
  cli=(pnpm dlx vercel@latest)
fi

cd "$(dirname "$0")/.."
"${cli[@]}" deploy --yes "${args[@]+"${args[@]}"}"
