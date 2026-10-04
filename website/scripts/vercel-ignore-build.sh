#!/usr/bin/env bash
# Vercel Ignored Build Step for the website project.
# Exit 0 skips the deployment. Exit 1 builds.
# Only this directory is compared, so pushes that stay outside website do not deploy.

set -u

head="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

website_changed() {
  git diff --quiet "$1" "$head" -- .
  case $? in
    0) return 1 ;;
    1) return 0 ;;
    *)
      echo "Cannot diff $1; building the site." >&2
      exit 1
      ;;
  esac
}

base=""
if [ -n "${VERCEL_GIT_PREVIOUS_SHA:-}" ]; then
  if git cat-file -e "${VERCEL_GIT_PREVIOUS_SHA}^{commit}" 2>/dev/null; then
    base="$VERCEL_GIT_PREVIOUS_SHA"
  else
    echo "Previous deployment is outside this clone; building the site." >&2
    exit 1
  fi
fi

if [ -z "$base" ]; then
  ref="${VERCEL_GIT_COMMIT_REF:-}"
  if [ -n "$ref" ] && [ "$ref" != "main" ] && [ "$ref" != "master" ]; then
    if ! git rev-parse --verify --quiet origin/main >/dev/null; then
      git fetch --no-tags --depth=200 origin main >/dev/null 2>&1 || true
    fi
    if git rev-parse --verify --quiet origin/main >/dev/null; then
      base="$(git merge-base "$head" origin/main 2>/dev/null || true)"
    fi
  fi
fi

if [ -z "$base" ]; then
  if git rev-parse --verify --quiet "${head}^" >/dev/null; then
    base="${head}^"
  else
    exit 1
  fi
fi

if website_changed "$base"; then
  echo "Website changed since ${base}; building." >&2
  exit 1
fi

echo "No website changes since ${base}; skipping the Vercel build." >&2
exit 0
