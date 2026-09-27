#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COOKIE="$(mktemp)"
LOGIN="$(mktemp)"
PORT=18080

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then kill "$SERVER_PID" 2>/dev/null || true; fi
  rm -f "$COOKIE" "$LOGIN" data/players/admin.json data/players/admin.json.lock data/runtime/used-lot.json data/runtime/used-lot.json.lock
}
trap cleanup EXIT

rm -f data/players/admin.json data/players/admin.json.lock data/runtime/used-lot.json data/runtime/used-lot.json.lock
php -S 127.0.0.1:$PORT -t . >/tmp/forever-racing-api-test.log 2>&1 &
SERVER_PID=$!

READY=0
for _ in {1..30}; do
  if curl -sS "http://127.0.0.1:$PORT/api/auth/session.php" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.2
done
if [[ "$READY" != "1" ]]; then
  echo "PHP development server did not start." >&2
  cat /tmp/forever-racing-api-test.log >&2 || true
  exit 1
fi

LOGIN_STATUS="$(curl -sS -o "$LOGIN" -w '%{http_code}' -c "$COOKIE" -H 'Content-Type: application/json'   -d '{"username":"aDmIn","password":"12345"}'   "http://127.0.0.1:$PORT/api/auth/login.php")"
if [[ "$LOGIN_STATUS" != "200" ]]; then
  echo "Login HTTP status: $LOGIN_STATUS" >&2
  cat "$LOGIN" >&2 || true
  cat /tmp/forever-racing-api-test.log >&2 || true
  exit 1
fi

jq -e '.authenticated == true and .player.tutorial.step == "welcome"' "$LOGIN" >/dev/null
CSRF="$(jq -r '.csrf' "$LOGIN")"

post() {
  local path="$1"
  local body="$2"
  local response
  local status
  response="$(mktemp)"
  status="$(curl -sS -o "$response" -w '%{http_code}' -b "$COOKIE"     -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json'     -d "$body" "http://127.0.0.1:$PORT/api/$path")"
  if [[ "$status" != "200" ]]; then
    echo "API write failed: $path" >&2
    echo "Request: $body" >&2
    echo "HTTP status: $status" >&2
    cat "$response" >&2 || true
    echo "--- PHP server log ---" >&2
    cat /tmp/forever-racing-api-test.log >&2 || true
    rm -f "$response"
    return 1
  fi
  cat "$response"
  rm -f "$response"
}

PLAYER="$(post tutorial/advance.php '{"action":"welcome_complete"}')"
echo "$PLAYER" | jq -e '.player.tutorial.step == "buy_first_car"' >/dev/null

PLAYER="$(post showroom/purchase.php '{"stockId":1}')"
CAR_ID="$(echo "$PLAYER" | jq -r '.player.selectedCarId')"
echo "$PLAYER" | jq -e '.player.garage[0].buildStage == 1 and .player.tutorial.step == "visit_garage"' >/dev/null

PLAYER="$(post tutorial/advance.php '{"action":"garage_explained"}')"
echo "$PLAYER" | jq -e '.player.tutorial.step == "buy_first_upgrade"' >/dev/null

PLAYER="$(post parts/purchase.php '{"catalogId":"s1_intake_1"}')"
PART_ID="$(echo "$PLAYER" | jq -r '.player.inventory.parts[] | select(.catalogId=="s1_intake_1") | .inventoryId')"
echo "$PLAYER" | jq -e '.player.tutorial.step == "install_first_upgrade"' >/dev/null

PLAYER="$(post parts/install.php "{\"inventoryId\":\"$PART_ID\",\"carId\":\"$CAR_ID\"}")"
echo "$PLAYER" | jq -e '.player.garage[0].derived.hp == 109 and .player.tutorial.step == "build_stages"' >/dev/null

PLAYER="$(post tutorial/advance.php '{"action":"build_stages_explained"}')"
echo "$PLAYER" | jq -e '.player.tutorial.step == "first_race"' >/dev/null

PLAYER="$(post race/quick.php '{}')"
echo "$PLAYER" | jq -e '.player.tutorial.status == "complete" and .player.progression.rep >= 27' >/dev/null

echo "Authenticated PHP API FTUE smoke test passed."
