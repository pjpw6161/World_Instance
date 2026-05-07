#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/reindex-search.sh --api-base-url <url> --admin-token <token>

Example:
  scripts/reindex-search.sh --api-base-url http://localhost:8080 --admin-token "$WORLD_FORGE_ADMIN_TOKEN"

This script calls Spring Boot POST /api/admin/search/maps/reindex.
It does not call Elasticsearch directly.
EOF
}

api_base_url="${WORLD_FORGE_API_BASE_URL:-}"
admin_token="${WORLD_FORGE_ADMIN_TOKEN:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-base-url)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --api-base-url." >&2
        usage >&2
        exit 2
      fi
      api_base_url="${2:-}"
      shift 2
      ;;
    --admin-token)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --admin-token." >&2
        usage >&2
        exit 2
      fi
      admin_token="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "${api_base_url// }" ]]; then
  echo "Missing --api-base-url." >&2
  usage >&2
  exit 2
fi

if [[ -z "${admin_token// }" ]]; then
  echo "Missing --admin-token." >&2
  usage >&2
  exit 2
fi

api_base_url="${api_base_url%/}"
if [[ "$api_base_url" == */api ]]; then
  reindex_url="$api_base_url/admin/search/maps/reindex"
else
  reindex_url="$api_base_url/api/admin/search/maps/reindex"
fi

echo "Reindexing public map search projection through Spring Boot API..."
echo "Endpoint: $reindex_url"

response="$(
  curl -fsS \
    -X POST \
    -H "X-World-Forge-Admin-Token: $admin_token" \
    "$reindex_url"
)"

json_value() {
  local key="$1"
  printf '%s\n' "$response" | sed -n "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"\{0,1\}\([^\",}]*\)\"\{0,1\}.*/\1/p"
}

index_name="$(json_value indexName)"
public_projects="$(json_value publicProjects)"
indexed_documents="$(json_value indexedDocuments)"
skipped_projects="$(json_value skippedProjects)"
rebuilt_at="$(json_value rebuiltAt)"

if [[ -z "$index_name" && -z "$indexed_documents" ]]; then
  echo "Reindex request succeeded, but the response shape was unexpected:" >&2
  printf '%s\n' "$response" >&2
  exit 1
fi

echo "Reindex complete."
echo "Index: $index_name"
echo "Public projects: $public_projects"
echo "Indexed documents: $indexed_documents"
echo "Skipped projects: $skipped_projects"
echo "Rebuilt at: $rebuilt_at"
