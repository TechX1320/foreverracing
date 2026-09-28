#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COOKIE="$(mktemp)"
COOKIE2="$(mktemp)"
LOGIN="$(mktemp)"
LOGIN2="$(mktemp)"
PORT=18080

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then kill "$SERVER_PID" 2>/dev/null || true; fi
  rm -f "$COOKIE" "$COOKIE2" "$LOGIN" "$LOGIN2" data/players/admin.json data/players/admin.json.lock data/runtime/used-lot.json data/runtime/used-lot.json.lock data/runtime/active-sessions.json data/runtime/active-sessions.json.lock
}
trap cleanup EXIT

rm -f data/players/admin.json data/players/admin.json.lock data/runtime/used-lot.json data/runtime/used-lot.json.lock data/runtime/active-sessions.json data/runtime/active-sessions.json.lock
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

DUP_STATUS="$(curl -sS -o "$LOGIN2" -w '%{http_code}' -c "$COOKIE2" -H 'Content-Type: application/json'   -d '{"username":"ADMIN","password":"12345"}'   "http://127.0.0.1:$PORT/api/auth/login.php")"
if [[ "$DUP_STATUS" != "409" ]]; then
  echo "Expected duplicate login to return 409, got $DUP_STATUS" >&2
  cat "$LOGIN2" >&2 || true
  exit 1
fi
jq -e '.code == "ACCOUNT_ALREADY_ACTIVE"' "$LOGIN2" >/dev/null

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

PLAYER="$(post race/quick.php '{"distance":"1/4"}')"
echo "$PLAYER" | jq -e '.player.tutorial.status == "complete" and .player.progression.rep >= 27 and .player.progression.exp > 0' >/dev/null
echo "$PLAYER" | jq -e '.race.distance == "1/4" and .race.player.trapSpeed > 0 and (.race.location.name | length) > 0 and (.race.weather.name | length) > 0' >/dev/null

PLAYER="$(post race/quick.php '{"distance":"1/2"}')"
echo "$PLAYER" | jq -e '.race.distance == "1/2" and ((.player.raceHistory | length) >= 2)' >/dev/null

LOGOUT="$(post auth/logout.php '{}')"
echo "$LOGOUT" | jq -e '.reset == true' >/dev/null
if [[ -f data/players/admin.json ]]; then
  echo "Admin player save still exists after logout reset." >&2
  exit 1
fi

FRESH_STATUS="$(curl -sS -o "$LOGIN2" -w '%{http_code}' -c "$COOKIE2" -H 'Content-Type: application/json'   -d '{"username":"admin","password":"12345"}'   "http://127.0.0.1:$PORT/api/auth/login.php")"
if [[ "$FRESH_STATUS" != "200" ]]; then
  echo "Fresh login after Admin reset failed: $FRESH_STATUS" >&2
  cat "$LOGIN2" >&2 || true
  exit 1
fi
jq -e '.authenticated == true and .player.tutorial.step == "welcome" and ((.player.garage | length) == 0) and .player.progression.exp == 0' "$LOGIN2" >/dev/null

echo "Authenticated PHP API FTUE + session/reset + V0.3B race core smoke test passed."
