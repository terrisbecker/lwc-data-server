#!/usr/bin/env bash
# Smoke-test PMN scum photos against a running dev server (npm run dev).
# Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... ./scripts/test-scum-photos.sh [path/to/photo.jpg]
# Requires: curl, jq, a seeded admin, and S3 credentials for the presigned PUT.
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PHOTO="${1:-}"
: "${ADMIN_EMAIL:?set ADMIN_EMAIL}" "${ADMIN_PASSWORD:?set ADMIN_PASSWORD}"

FAILS=0
check() { # check <label> <expected> <actual>
  if [ "$2" = "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1 (expected $2, got $3)"; FAILS=$((FAILS + 1)); fi
}
# req <method> <path> [json] [auth?] -> prints "<status> <body>"
req() {
  local args=(-s -o /tmp/scum_body -w '%{http_code}' -X "$1" "$BASE$2" -H 'Content-Type: application/json')
  [ -n "${3:-}" ] && args+=(-d "$3")
  [ "${4:-auth}" = auth ] && args+=(-H "Authorization: Bearer $TOKEN")
  local code; code=$(curl "${args[@]}")
  echo "$code $(cat /tmp/scum_body)"
}
status() { echo "${1%% *}"; }
body() { echo "${1#* }"; }

TOKEN=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "$(jq -n --arg e "$ADMIN_EMAIL" --arg p "$ADMIN_PASSWORD" '{email:$e,password:$p}')" | jq -r '.data.token')
[ "$TOKEN" != null ] || { echo "login failed"; exit 1; }

# 1. Upload a JPEG (presign -> PUT -> confirm)
if [ -z "$PHOTO" ]; then PHOTO=$(mktemp /tmp/scumXXXX.jpg); printf '\xff\xd8\xff\xd9' > "$PHOTO"; fi
SIZE=$(wc -c < "$PHOTO" | tr -d ' ')
R=$(req POST /api/uploads/presigned-urls "{\"files\":[{\"filename\":\"scum.jpg\",\"contentType\":\"image/jpeg\",\"sizeBytes\":$SIZE}]}")
UPLOAD_ID=$(body "$R" | jq -r '.data[0].uploadId'); PUT_URL=$(body "$R" | jq -r '.data[0].presignedUrl')
curl -s -f -X PUT -H 'Content-Type: image/jpeg' --data-binary "@$PHOTO" "$PUT_URL" > /dev/null
R=$(req POST /api/uploads/confirm "{\"uploadIds\":[\"$UPLOAD_ID\"]}"); check "confirm upload" 1 "$(body "$R" | jq '.data.confirmed')"

# 2. scum_photos without has_scum -> has_scum auto-true
R=$(req POST /api/pmn/combined-field-data "{\"sampling_site\":\"scum-test\",\"scum_photos\":[\"$UPLOAD_ID\"]}")
check "create with scum photo -> 201" 201 "$(status "$R")"
check "has_scum auto-set" true "$(body "$R" | jq '.data.has_scum')"
RECORD_ID=$(body "$R" | jq -r '.data.id')

# 3. contradiction
R=$(req POST /api/pmn/combined-field-data "{\"scum_photos\":[\"$UPLOAD_ID\"],\"has_scum\":false}")
check "scum_photos + has_scum=false -> 400" 400 "$(status "$R")"

# 4. bad ids / overlap
R=$(req POST /api/pmn/combined-field-data '{"scum_photos":["00000000-0000-4000-8000-000000000000"]}')
check "unknown upload -> 400" 400 "$(status "$R")"
R=$(req POST /api/pmn/combined-field-data "{\"photos\":[\"$UPLOAD_ID\"],\"scum_photos\":[\"$UPLOAD_ID\"]}")
check "photo in both lists -> 400" 400 "$(status "$R")"

# 6. filter
R=$(req GET "/api/pmn/combined-field-data?hasScum=true" "" noauth)
check "hasScum=true filter only flagged rows" true "$(body "$R" | jq '[.data[].has_scum] | all')"
R=$(req GET "/api/pmn/combined-field-data?hasScum=foo" "" noauth); check "hasScum=foo -> 400" 400 "$(status "$R")"

# 7a. public scum photo URL while referenced
R=$(req GET "/api/pmn/scum-photos/$UPLOAD_ID/url" "" noauth); check "public scum photo url -> 200" 200 "$(status "$R")"
check "presigned url loads" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$(body "$R" | jq -r '.data.url')")"

# 5. PATCH rules
R=$(req PATCH "/api/pmn/combined-field-data/$RECORD_ID" '{"has_scum":false}'); check "patch has_scum=false w/ photos -> 400" 400 "$(status "$R")"
R=$(req PATCH "/api/pmn/combined-field-data/$RECORD_ID" '{"has_scum":false,"scum_photos":[]}'); check "clear scum -> 200" 200 "$(status "$R")"

# 7b. no longer public once unreferenced
R=$(req GET "/api/pmn/scum-photos/$UPLOAD_ID/url" "" noauth); check "unreferenced scum photo -> 404" 404 "$(status "$R")"

# cleanup
req DELETE "/api/pmn/combined-field-data/$RECORD_ID" > /dev/null

echo; [ "$FAILS" -eq 0 ] && echo "All checks passed" || { echo "$FAILS check(s) failed"; exit 1; }
