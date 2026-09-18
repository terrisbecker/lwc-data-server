#!/usr/bin/env bash
# Smoke-test the API response envelope (success + error) against a running dev
# server (npm run dev). Contract-only: no S3 and no writes that need cleanup.
#
# Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... ./scripts/test-envelope.sh
# Requires: curl, jq, a seeded admin.
#
# Not covered here (needs the DB taken down, so it stays manual):
#   docker compose stop db && curl -i localhost:3000/api/pmn/combined-field-data
# Expect a 500 carrying PMN_READ_FAILED + a requestId, with no SQL/host/connection
# text anywhere in the body — and the matching server log line for that same
# requestId showing the redacted `cause` chain.
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
: "${ADMIN_EMAIL:?set ADMIN_EMAIL}" "${ADMIN_PASSWORD:?set ADMIN_PASSWORD}"

FAILS=0
HDR=/tmp/env_hdr
BODY=/tmp/env_body

check() { # check <label> <expected> <actual>
  if [ "$2" = "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1 (expected $2, got $3)"; FAILS=$((FAILS + 1)); fi
}
# req <method> <path> [json] [auth|noauth] [extra curl args...] -> prints status
req() {
  local method="$1" path="$2" json="${3:-}" mode="${4:-auth}"; shift 4 2>/dev/null || shift $#
  local args=(-s -o "$BODY" -D "$HDR" -w '%{http_code}' -X "$method" "$BASE$path" -H 'Content-Type: application/json')
  [ -n "$json" ] && args+=(-d "$json")
  [ "$mode" = auth ] && args+=(-H "Authorization: Bearer $TOKEN")
  [ "$#" -gt 0 ] && args+=("$@")
  curl "${args[@]}"
}
jqb() { jq -r "$1" < "$BODY"; }
reqid() { tr -d '\r' < "$HDR" | awk 'tolower($1)=="x-request-id:"{print $2}'; }

TOKEN=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "$(jq -n --arg e "$ADMIN_EMAIL" --arg p "$ADMIN_PASSWORD" '{email:$e,password:$p}')" | jq -r '.data.token')
[ "$TOKEN" != null ] || { echo "login failed"; exit 1; }

RANDOM_UUID=$(uuidgen | tr 'A-Z' 'a-z')

echo "--- envelope basics ---"
S=$(req GET /health "" noauth)
check "health 200" 200 "$S"
check "health stays un-enveloped" "ok" "$(jqb '.status')"
check "health has no data key" "null" "$(jqb '.data')"
[ -n "$(reqid)" ] && echo "PASS  health carries X-Request-Id" || { echo "FAIL  health X-Request-Id"; FAILS=$((FAILS+1)); }

echo "--- transport-level errors ---"
S=$(req GET /api/definitely-not-a-route "" noauth)
check "unmatched route status" 404 "$S"
check "unmatched route code" "ROUTE_NOT_FOUND" "$(jqb '.error.code')"

S=$(req POST /auth/login '{bad json' noauth)
check "malformed JSON status" 400 "$S"
check "malformed JSON code" "MALFORMED_JSON" "$(jqb '.error.code')"

BIG=$(head -c 2000000 /dev/zero | tr '\0' 'a')
S=$(req POST /auth/login "{\"email\":\"$BIG\"}" noauth)
check "oversized body status" 413 "$S"
check "oversized body code" "PAYLOAD_TOO_LARGE" "$(jqb '.error.code')"

echo "--- auth ---"
S=$(req POST /auth/login '{}' noauth)
check "login missing fields status" 400 "$S"
check "login missing fields code" "MISSING_FIELD" "$(jqb '.error.code')"

S=$(req POST /auth/login "$(jq -n --arg e "$ADMIN_EMAIL" '{email:$e,password:"wrong-password"}')" noauth)
check "bad password status" 401 "$S"
check "bad password code" "INVALID_CREDENTIALS" "$(jqb '.error.code')"
BADPW_MSG=$(jqb '.error.message')
check "bad password wording preserved" "Invalid email or password" "$BADPW_MSG"

req POST /auth/login '{"email":"nobody-here@example.invalid","password":"wrong-password"}' noauth > /dev/null
UNKNOWN_MSG=$(jqb '.error.message')
check "unknown email is indistinguishable from bad password" "$BADPW_MSG" "$UNKNOWN_MSG"

S=$(req GET /api/users "" noauth)
check "no token status" 401 "$S"
check "no token code" "UNAUTHORIZED" "$(jqb '.error.code')"

S=$(curl -s -o "$BODY" -D "$HDR" -w '%{http_code}' "$BASE/api/users" -H "Authorization: Bearer garbage.token.here")
check "garbage token status" 401 "$S"
check "garbage token code" "TOKEN_INVALID" "$(jqb '.error.code')"

echo "--- success envelope ---"
S=$(req GET /api/pmn/combined-field-data "" noauth)
check "pmn list status" 200 "$S"
[ -n "$(jqb '.message')" ] && [ "$(jqb '.message')" != null ] && echo "PASS  pmn list has message" || { echo "FAIL  pmn list message"; FAILS=$((FAILS+1)); }
check "pmn meta.count matches data length" "$(jqb '.data | length')" "$(jqb '.meta.count')"
check "pmn data still an array (back-compat)" "array" "$(jqb '.data | type')"

S=$(req GET /api/phosphate-data "" noauth)
check "phosphate meta.count matches" "$(jqb '.data | length')" "$(jqb '.meta.count')"

S=$(req GET /api/users)
check "users list status" 200 "$S"
check "users meta.count matches" "$(jqb '.data | length')" "$(jqb '.meta.count')"

echo "--- validation + not-found ---"
S=$(req GET "/api/pmn/combined-field-data?hasScum=maybe" "" noauth)
check "bad hasScum status" 400 "$S"
check "bad hasScum code" "INVALID_FIELD" "$(jqb '.error.code')"
check "bad hasScum wording preserved" "hasScum must be true or false" "$(jqb '.error.message')"

S=$(req PATCH /api/pmn/combined-field-data/not-a-uuid '{}')
check "malformed id status" 400 "$S"
check "malformed id code" "INVALID_ID" "$(jqb '.error.code')"
check "malformed id wording preserved" "Invalid id" "$(jqb '.error.message')"

S=$(req PATCH "/api/pmn/combined-field-data/$RANDOM_UUID" '{}')
check "unknown pmn record status" 404 "$S"
check "unknown pmn record code" "PMN_RECORD_NOT_FOUND" "$(jqb '.error.code')"

S=$(req GET "/api/pmn/scum-photos/$RANDOM_UUID/url" "" noauth)
check "unknown scum photo status" 404 "$S"
check "unknown scum photo code" "PMN_SCUM_PHOTO_NOT_FOUND" "$(jqb '.error.code')"
check "scum photo 404 leaks no details" "null" "$(jqb '.error.details')"

echo "--- watershed loc_id (was a 500) ---"
S=$(req POST /api/phosphate-data '{"lab_case_file_number":1}')
check "missing loc_id status" 400 "$S"
check "missing loc_id code" "MISSING_FIELD" "$(jqb '.error.code')"

S=$(req POST /api/phosphate-data "{\"lab_case_file_number\":1,\"loc_id\":\"$RANDOM_UUID\"}")
check "unknown loc_id status" 400 "$S"
check "unknown loc_id code" "PHOSPHATE_LOCATION_UNKNOWN" "$(jqb '.error.code')"

echo "--- users conflict + uploads partial confirm ---"
S=$(req POST /api/users "$(jq -n --arg e "$ADMIN_EMAIL" '{email:$e,password:"whatever-123"}')")
check "duplicate email status" 409 "$S"
check "duplicate email code" "USER_EMAIL_TAKEN" "$(jqb '.error.code')"

S=$(req POST /api/users '{"email":"x@example.invalid","password":"pw","role":"wizard"}')
check "unknown role status" 400 "$S"
check "unknown role code" "INVALID_FIELD" "$(jqb '.error.code')"

S=$(req POST /api/uploads/confirm "{\"uploadIds\":[\"$RANDOM_UUID\"]}")
check "confirm unknown upload status (unchanged)" 200 "$S"
check "confirm data shape unchanged" 0 "$(jqb '.data.confirmed')"
check "confirm reports the shortfall" 1 "$(jqb '.meta.skipped')"

echo "--- requestId + leak sweep ---"
S=$(req GET /api/definitely-not-a-route "" noauth)
check "error body requestId matches header" "$(reqid)" "$(jqb '.error.requestId')"

for path in /api/definitely-not-a-route "/api/pmn/combined-field-data?hasScum=maybe" "/api/pmn/scum-photos/$RANDOM_UUID/url"; do
  req GET "$path" "" noauth > /dev/null
  if grep -Eqi 'postgres://|[[:space:]]SELECT[[:space:]]|prisma|password_hash|at /Users/|"stack"' "$BODY"; then
    echo "FAIL  leak sweep: $path"; FAILS=$((FAILS + 1))
  else
    echo "PASS  leak sweep: $path"
  fi
done

echo
if [ "$FAILS" -eq 0 ]; then echo "All checks passed."; else echo "$FAILS check(s) failed."; exit 1; fi
