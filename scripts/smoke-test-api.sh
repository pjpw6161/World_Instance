#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/smoke-test-api.sh --api-base-url <url> --admin-token <token> [--prefix <prefix>]

Example:
  scripts/smoke-test-api.sh --api-base-url http://localhost:8080 --admin-token "$WORLD_FORGE_ADMIN_TOKEN"

Requires curl and python3.
Creates test user/map data with a WF-SMOKE prefix and does not delete production data.
Calls Spring Boot APIs only; it never calls Elasticsearch directly.
EOF
}

api_base_url="${WORLD_FORGE_API_BASE_URL:-}"
admin_token="${WORLD_FORGE_ADMIN_TOKEN:-}"
prefix="WF-SMOKE"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-base-url)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --api-base-url." >&2
        exit 2
      fi
      api_base_url="$2"
      shift 2
      ;;
    --admin-token)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --admin-token." >&2
        exit 2
      fi
      admin_token="$2"
      shift 2
      ;;
    --prefix)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --prefix." >&2
        exit 2
      fi
      prefix="$2"
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
  api_base_url="${api_base_url%/api}"
fi

run_id="$(date -u +%Y%m%d%H%M%S)-$(python3 - <<'PY'
import uuid
print(uuid.uuid4().hex[:8])
PY
)"
email="smoke-${run_id}@example.com"
password="Password123!"
title="${prefix} API Smoke ${run_id}"
map_hash="smoke-${run_id}"
project_id=""
auth_token=""

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

urlencode() {
  python3 - "$1" <<'PY'
import sys
from urllib.parse import quote
print(quote(sys.argv[1], safe=""))
PY
}

json_get() {
  python3 - "$1" "$2" <<'PY'
import json
import sys

path = sys.argv[1].split(".")
with open(sys.argv[2], "r", encoding="utf-8") as handle:
    value = json.load(handle)

for part in path:
    if part == "":
        continue
    if isinstance(value, list):
        value = value[int(part)]
    else:
        value = value.get(part)
    if value is None:
        print("")
        sys.exit(0)

if isinstance(value, (dict, list)):
    print(json.dumps(value, separators=(",", ":")))
else:
    print(value)
PY
}

json_contains_project() {
  python3 - "$1" "$2" <<'PY'
import json
import sys

project_id = sys.argv[1]
with open(sys.argv[2], "r", encoding="utf-8") as handle:
    response = json.load(handle)

for result in response.get("results", []):
    if str(result.get("projectId")) == project_id:
        print("true")
        sys.exit(0)
print("false")
PY
}

wait_for_search_project() {
  local path="$1"
  local project="$2"
  local output_file="$3"
  local attempts="${4:-10}"
  local delay_seconds="${5:-1}"

  for ((attempt = 1; attempt <= attempts; attempt++)); do
    request_json GET "$path" "" "" "$output_file"
    if [[ "$(json_contains_project "$project" "$output_file")" == "true" ]]; then
      return 0
    fi
    if [[ "$attempt" -lt "$attempts" ]]; then
      echo "Search result not visible yet; retrying in ${delay_seconds} second(s)... (${attempt}/${attempts})"
      sleep "$delay_seconds"
    fi
  done

  return 1
}

request_json() {
  local method="$1"
  local path="$2"
  local body_file="${3:-}"
  local token="${4:-}"
  local output_file="$5"
  local url="${api_base_url}${path}"
  local args=(-fsS -X "$method" -H "Accept: application/json")

  if [[ -n "$body_file" ]]; then
    args+=(-H "Content-Type: application/json" --data-binary "@${body_file}")
  fi
  if [[ -n "$token" ]]; then
    args+=(-H "Authorization: Bearer ${token}")
  fi

  curl "${args[@]}" "$url" > "$output_file"
}

request_admin() {
  local output_file="$1"
  curl -fsS -X POST \
    -H "Accept: application/json" \
    -H "X-World-Forge-Admin-Token: ${admin_token}" \
    "${api_base_url}/api/admin/search/maps/reindex" > "$output_file"
}

step() {
  local name="$1"
  shift
  echo
  echo "==> $name"
  if "$@"; then
    echo "OK: $name"
  else
    local status=$?
    echo "FAILED at step '$name'." >&2
    exit "$status"
  fi
}

assert_eq() {
  local actual="$1"
  local expected="$2"
  local message="$3"
  if [[ "$actual" != "$expected" ]]; then
    echo "$message Expected '$expected', got '$actual'." >&2
    return 1
  fi
}

assert_not_empty() {
  local value="$1"
  local message="$2"
  if [[ -z "$value" ]]; then
    echo "$message" >&2
    return 1
  fi
}

make_signup_body() {
  python3 - "$email" "$password" <<'PY' > "$1"
import json
import sys
print(json.dumps({
    "email": sys.argv[1],
    "password": sys.argv[2],
    "nickname": "Smoke Test User"
}, separators=(",", ":")))
PY
}

make_login_body() {
  python3 - "$email" "$password" <<'PY' > "$1"
import json
import sys
print(json.dumps({
    "email": sys.argv[1],
    "password": sys.argv[2]
}, separators=(",", ":")))
PY
}

make_map_body() {
  python3 - "$title" "$map_hash" <<'PY' > "$1"
import json
import sys

title = sys.argv[1]
map_hash = sys.argv[2]
payload = {
    "title": title,
    "description": "Created by deployment smoke test. Safe to leave for audit.",
    "recipe": {
        "engineVersion": "0.1.0",
        "seed": 24680,
        "width": 256,
        "height": 256,
        "features": {
            "mountains": True,
            "forests": True,
            "trees": True,
            "roads": True,
            "caves": False,
            "rivers": False,
            "villages": True
        },
        "algorithms": {
            "terrain": "noise-island",
            "cave": "cellular-automata",
            "road": "astar",
            "objectPlacement": "biome-density"
        },
        "params": {
            "waterLevel": 0.38,
            "mountainLevel": 0.72,
            "forestDensity": 0.55,
            "caveDensity": 0.42,
            "roadComplexity": 0.4
        }
    },
    "stats": {
        "waterRatio": 0.25,
        "landRatio": 0.75,
        "forestRatio": 0.24,
        "mountainRatio": 0.1,
        "treeCount": 10,
        "roadLength": 4,
        "caveAreaRatio": 0.0,
        "villageCount": 1,
        "creatureCount": 4,
        "surfaceCreatureCount": 3,
        "caveCreatureCount": 1,
        "portalCount": 1,
        "reachableAreaRatio": 0.76,
        "blockedRatio": 0.15,
        "generationTimeMs": 1,
        "livingStats": {
            "creatureCount": 4,
            "surfaceCreatureCount": 3,
            "caveCreatureCount": 1,
            "reachableAreaRatio": 0.76,
            "blockedTileRatio": 0.15,
            "portalCount": 1,
            "npcCount": 1,
            "livingDensity": 0.00008,
            "creatureDensity": 0.00006
        }
    },
    "mapHash": map_hash
}
print(json.dumps(payload, separators=(",", ":")))
PY
}

make_publish_body() {
  printf '{"visibility":"PUBLIC"}' > "$1"
}

echo "World Forge API smoke test"
echo "API base URL: $api_base_url"
echo "Smoke prefix: $prefix"
echo "Smoke title: $title"
echo "This script creates test data and does not delete production data."

health_step() {
  request_json GET "/api/health" "" "" "$tmp_dir/health.json"
  assert_eq "$(json_get status "$tmp_dir/health.json")" "ok" "Health check failed."
}

signup_step() {
  make_signup_body "$tmp_dir/signup-body.json"
  request_json POST "/api/auth/signup" "$tmp_dir/signup-body.json" "" "$tmp_dir/signup.json"
  assert_eq "$(json_get tokenType "$tmp_dir/signup.json")" "Bearer" "Signup token type mismatch."
  assert_not_empty "$(json_get token "$tmp_dir/signup.json")" "Signup token missing."
}

login_step() {
  make_login_body "$tmp_dir/login-body.json"
  request_json POST "/api/auth/login" "$tmp_dir/login-body.json" "" "$tmp_dir/login.json"
  auth_token="$(json_get token "$tmp_dir/login.json")"
  assert_not_empty "$auth_token" "Login token missing."
}

save_map_step() {
  make_map_body "$tmp_dir/map-body.json"
  request_json POST "/api/maps" "$tmp_dir/map-body.json" "$auth_token" "$tmp_dir/map.json"
  project_id="$(json_get id "$tmp_dir/map.json")"
  assert_not_empty "$project_id" "Created project id missing."
  assert_eq "$(json_get visibility "$tmp_dir/map.json")" "PRIVATE" "New map should be private."
}

private_search_step() {
  local encoded_title
  encoded_title="$(urlencode "$title")"
  request_json GET "/api/search/maps?keyword=${encoded_title}" "" "" "$tmp_dir/private-search.json"
  assert_eq "$(json_contains_project "$project_id" "$tmp_dir/private-search.json")" "false" "Private map appeared in public search before publish."
}

publish_step() {
  make_publish_body "$tmp_dir/publish-body.json"
  request_json PATCH "/api/maps/${project_id}" "$tmp_dir/publish-body.json" "$auth_token" "$tmp_dir/published.json"
  assert_eq "$(json_get visibility "$tmp_dir/published.json")" "PUBLIC" "Published map should be public."
}

reindex_step() {
  request_admin "$tmp_dir/reindex.json"
  echo "Index: $(json_get indexName "$tmp_dir/reindex.json")"
  echo "Public projects: $(json_get publicProjects "$tmp_dir/reindex.json")"
  echo "Indexed documents: $(json_get indexedDocuments "$tmp_dir/reindex.json")"
  echo "Skipped projects: $(json_get skippedProjects "$tmp_dir/reindex.json")"
  echo "Rebuilt at: $(json_get rebuiltAt "$tmp_dir/reindex.json")"
  assert_not_empty "$(json_get indexedDocuments "$tmp_dir/reindex.json")" "Reindex indexedDocuments missing."
}

public_search_step() {
  local encoded_title
  encoded_title="$(urlencode "$title")"
  if ! wait_for_search_project "/api/search/maps?keyword=${encoded_title}" "$project_id" "$tmp_dir/public-search.json"; then
    echo "Published map was not found in public search after waiting for search refresh." >&2
    return 1
  fi
}

facets_step() {
  request_json GET "/api/search/maps/facets" "" "" "$tmp_dir/facets.json"
  assert_not_empty "$(json_get features "$tmp_dir/facets.json")" "Facets features missing."
  assert_not_empty "$(json_get terrainAlgorithms "$tmp_dir/facets.json")" "Facets terrainAlgorithms missing."
}

step "API health" health_step
step "signup" signup_step
step "login" login_step
step "map save as private" save_map_step
step "private map is not searchable before publish" private_search_step
step "map publish" publish_step
step "reindex public maps" reindex_step
step "search published map" public_search_step
step "facets" facets_step

echo
echo "Smoke test complete."
echo "Created user: $email"
echo "Created map project: $project_id"
echo "Created public title: $title"
