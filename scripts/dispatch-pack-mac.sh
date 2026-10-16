#!/usr/bin/env bash
# Dispatch the signed macOS DMG workflow via GitHub Actions API (gh).
# Requires Cloud Agent secret GH_TOKEN or GITHUB_TOKEN (PAT with repo + Actions write).
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-shane-carlson/HuManuScript}"
REF="${PACK_MAC_REF:-main}"
WORKFLOW_FILE="${PACK_MAC_WORKFLOW:-pack-mac.yml}"

if [[ -z "${GH_TOKEN:-}" && -z "${GITHUB_TOKEN:-}" ]]; then
  echo "Missing GH_TOKEN (or GITHUB_TOKEN)." >&2
  echo "Add a fine-grained PAT to this Cloud Agent environment secrets as GH_TOKEN." >&2
  echo "Scopes: Repository access to ${REPO}; Permissions: Contents (read), Actions (read and write), Metadata (read)." >&2
  exit 1
fi

export GH_TOKEN="${GH_TOKEN:-$GITHUB_TOKEN}"

echo "Dispatching ${WORKFLOW_FILE} on ${REPO} @ ${REF} ..."
gh workflow run "${WORKFLOW_FILE}" --repo "${REPO}" --ref "${REF}"

sleep 2
echo ""
echo "Latest runs:"
gh run list --workflow="${WORKFLOW_FILE}" --repo "${REPO}" --limit 3
