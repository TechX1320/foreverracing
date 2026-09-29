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
FR_RACE_TIME_SCALE=0.01 php -S 127.0.0.1:$PORT -t . >/tmp/forever-racing-api-test.log 2>&1 &
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

LOT="$(curl -sS -b "$COOKIE" "http://127.0.0.1:$PORT/api/usedlot/listings.php")"
echo "$LOT" | jq -e '[.lot.listings[] | select(.starterListing == true)] | length == 3' >/dev/null
echo "$LOT" | jq -e '. as $root | [.lot.listings[] | select(.starterListing == true) as $listing | $root.cars[] | select(.stockId == $listing.stockId) | select(.starter == true and .visual.layered.layers.body.src != null)] | length == 3' >/dev/null
STARTER_LISTING_ID="$(echo "$LOT" | jq -r '.lot.listings[] | select(.starterListing == true and .stockId == 1) | .listingId' | head -n1)"
if [[ -z "$STARTER_LISTING_ID" || "$STARTER_LISTING_ID" == "null" ]]; then
  echo "Golf GTI starter listing was not generated." >&2
  exit 1
fi
STARTER_BODY="$(jq -nc --arg listingId "$STARTER_LISTING_ID" '{listingId:$listingId}')"
PLAYER="$(post usedlot/purchase.php "$STARTER_BODY")"
CAR_ID="$(echo "$PLAYER" | jq -r '.player.selectedCarId')"
echo "$PLAYER" | jq -e '.player.garage[0].buildStage == 1 and .player.garage[0].source == "used" and .player.garage[0].mileage >= 105000 and .player.garage[0].stockClass == "D" and .player.garage[0].performanceClass == "D"' >/dev/null
echo "$PLAYER" | jq -e '.player.tutorial.step == "visit_garage" and .player.garage[0].visual.layered.anchors.frontWheelCenter.y == 95 and (.player.garage[0].visual.layered.raceLayers.wheel.src | endswith("/wheel.png"))' >/dev/null

PLAYER="$(post tutorial/advance.php '{"action":"garage_explained"}')"
echo "$PLAYER" | jq -e '.player.tutorial.step == "buy_first_upgrade"' >/dev/null

BLOCKED_PART="$(mktemp)"
BLOCKED_PART_STATUS="$(curl -sS -o "$BLOCKED_PART" -w '%{http_code}' -b "$COOKIE" -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' -d '{"catalogId":"s1_exhaust_1"}' "http://127.0.0.1:$PORT/api/parts/purchase.php")"
if [[ "$BLOCKED_PART_STATUS" == "200" ]]; then
  echo "Tutorial incorrectly allowed a non-Intake first upgrade." >&2
  cat "$BLOCKED_PART" >&2 || true
  rm -f "$BLOCKED_PART"
  exit 1
fi
rm -f "$BLOCKED_PART"

PLAYER="$(post parts/purchase.php '{"catalogId":"s1_intake_1"}')"
PART_ID="$(echo "$PLAYER" | jq -r '.player.inventory.parts[] | select(.catalogId=="s1_intake_1") | .inventoryId')"
echo "$PLAYER" | jq -e --arg carId "$CAR_ID" '.player.tutorial.step == "install_first_upgrade" and (.player.inventory.parts[] | select(.catalogId=="s1_intake_1") | .purchasedForCarId) == $carId' >/dev/null

PLAYER="$(post parts/install.php "{\"inventoryId\":\"$PART_ID\",\"carId\":\"$CAR_ID\"}")"
echo "$PLAYER" | jq -e '.player.garage[0].derived.hp == 203 and .player.garage[0].performanceIndex > 0 and .player.garage[0].performanceClass == "D" and .player.tutorial.step == "first_race"' >/dev/null

PREVIEW="$(curl -sS -b "$COOKIE" "http://127.0.0.1:$PORT/api/race/preview.php")"
echo "$PREVIEW" | jq -e '.preview.opponent.name == "Test Mule" and .preview.performanceIndex > 0 and .preview.benchmarkEt > 0 and .preview.opponent.performanceIndex > 0 and .preview.opponent.performanceClass == "D" and (.preview.opponent.visual.layered.layers.body.src | length) > 0 and (.preview.opponent | has("hp") | not) and (.preview.opponent | has("torque") | not) and (.preview.opponent | has("weight") | not)' >/dev/null

PLAYER="$(post race/start.php '{"distance":"1/4"}')"
RACE_ID="$(echo "$PLAYER" | jq -r '.activeRace.raceId')"
echo "$PLAYER" | jq -e '.player.tutorial.step == "first_race" and .player.stats.races == 0 and .player.progression.exp == 0 and (.player.raceHistory | length) == 0' >/dev/null
echo "$PLAYER" | jq -e '.activeRace.distance == "1/4" and .activeRace.race.distanceFeet == 1320 and .activeRace.race.playerDrivetrain == "FWD" and .activeRace.race.player.trapSpeed > 0 and .activeRace.race.player.traction.gripLoss > 0 and .activeRace.race.player.traction.wheelSlip > 0 and .activeRace.race.player.traction.smokeLevel > 0 and .activeRace.race.location.name == "Local Test & Tune" and .activeRace.race.weather.name == "Cool & Cloudy" and .activeRace.race.player.foul == false and .activeRace.race.opponent.foul == false and .activeRace.race.won == true' >/dev/null
echo "$PLAYER" | jq -e --argjson preview "$PREVIEW" '.activeRace.race.playerPerformanceClass == "D" and .activeRace.race.opponent.name == $preview.preview.opponent.name and .activeRace.race.opponent.carName == $preview.preview.opponent.carName and .activeRace.race.opponent.performanceIndex == $preview.preview.opponent.performanceIndex and .activeRace.race.opponent.performanceClass == $preview.preview.opponent.performanceClass and (.activeRace.race.playerVisual.layered.layers.body.src | length) > 0 and (.activeRace.race.opponent.visual.layered.layers.body.src | length) > 0 and (.activeRace.race.opponent | has("hp") | not) and (.activeRace.race.opponent | has("torque") | not) and (.activeRace.race.opponent | has("weight") | not)' >/dev/null

DUP_RACE="$(post race/start.php '{"distance":"1/2"}')"
echo "$DUP_RACE" | jq -e --arg raceId "$RACE_ID" '.activeRace.raceId == $raceId and .activeRace.distance == "1/4" and .player.stats.races == 0' >/dev/null

sleep 0.35
RACE_BODY="$(printf '{"raceId":"%s"}' "$RACE_ID")"
PLAYER="$(post race/finish.php "$RACE_BODY")"
echo "$PLAYER" | jq -e '.player.activeRace == null and .player.tutorial.status == "complete" and .player.progression.rep >= 27 and .player.progression.exp > 0 and .player.stats.races == 1 and (.player.raceHistory | length) == 1' >/dev/null
echo "$PLAYER" | jq -e '.race.distance == "1/4" and .race.player.trapSpeed > 0 and .race.player.foul == false and .race.won == true' >/dev/null

BLOCKED_HALF="$(mktemp)"
BLOCKED_HALF_STATUS="$(curl -sS -o "$BLOCKED_HALF" -w '%{http_code}' -b "$COOKIE" -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' -d '{"distance":"1/2"}' "http://127.0.0.1:$PORT/api/race/start.php")"
if [[ "$BLOCKED_HALF_STATUS" == "200" ]]; then
  echo "Level 1 player incorrectly started a 1/2-mile race." >&2
  cat "$BLOCKED_HALF" >&2 || true
  rm -f "$BLOCKED_HALF"
  exit 1
fi
grep -qi "Level 5" "$BLOCKED_HALF"
rm -f "$BLOCKED_HALF"

LOT="$(curl -sS -b "$COOKIE" "http://127.0.0.1:$PORT/api/usedlot/listings.php")"
echo "$LOT" | jq -e '.lot.listings | length >= 4' >/dev/null
echo "$LOT" | jq -e '.lot.listings | all(.price <= .basePrice and .conditionFactor > 0 and .mileageFactor > 0)' >/dev/null

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

echo "Authenticated PHP API V0.4H.2 wheel-spin + grip-smoke telemetry test passed."
