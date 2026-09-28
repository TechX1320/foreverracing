# Forever Racing

Forever Racing is a systems-first browser drag-racing / garage-management game inspired by the earlier TextTuned Discord game.

V0.2 uses one shared frontend with two interchangeable runtime/persistence modes: a browser-local GitHub Pages development build and a PHP-backed server build for eventual hosted accounts/player data.

## Live development build

GitHub Pages:

`https://techx1320.github.io/foreverracing/`

Development credentials: `Admin` / `12345`.

The Pages build is intentionally local-only. Its login is a simulated development identity and saves are stored in the current browser. They are not shared across browsers or devices.

## V0.2.0-dev.4 playable direction

This build is the first gameplay/identity pass after the dual-runtime foundation.

### Game UI

- Compact navigation is the default.
- Desktop uses persistent player/current-car status, a navigation rail, the main game workspace, and an objective/context rail.
- Mobile/foldable layouts collapse into dense compact navigation without requiring the old oversized dashboard.
- The visual language is deliberately flatter and denser: tiny radii, thin separators, tables/lists, status bars, restrained color, and no permanent emoji navigation.
- The design takes inspiration from the information density of established browser games while keeping a garage/racing identity of its own.

### First-time user experience

New/migrated development profiles receive a persistent FTUE:

1. Welcome / core loop.
2. Choose one of three starter platforms.
3. Learn the Garage and current-car stats.
4. Buy the first upgrade.
5. Install it.
6. Learn Build Stages.
7. Run the first race.
8. Receive the tutorial reward and unlock normal navigation.

Tutorial state is stored with the player. Settings includes a development-only Reset Tutorial action.

### Build Stages

#### Stage 1 — Street / Stock Chassis

Seven required categories currently use a simple three-level progression:

- Intake
- Exhaust
- ECU
- Fuel
- Drivetrain
- Tires
- Weight Reduction

Stage 1 rules:

- Upgrades are purchased in order: 1 -> 2 -> 3.
- The UI shows projected HP / torque / weight before purchase.
- A Stage 1 category cannot be downgraded after advancing.
- All seven categories must reach Level 3 before the car can become Build Stage 2.

#### Stage 2 — Street Race

The completed Stage 1 setup becomes the car's new baseline.

Stage 2:

- removes the numbered training-wheel upgrade model;
- uses named, choice-based parts;
- shows exactly what each choice does to the current car;
- keeps Stage 2 parts available for later stages.

The first catalog contains two meaningful choices per category rather than randomized stat rolls.

#### Stage 3 / Stage 4 groundwork

Stage 3 and Stage 4 are represented in the data/schema and visual renderer but are not yet fully playable progression steps.

The vehicle/engine model now has groundwork for:

- engine bay size class;
- transverse/longitudinal orientation;
- factory displacement;
- stage-specific displacement allowance;
- engine size/configuration/orientation data;
- smaller-engine-in-larger-bay builds without automatically permitting physically absurd large-engine swaps.

Stage 3 is intended to unlock front-half/tube-chassis construction and engine swaps. Stage 4 is intended to widen powertrain/chassis freedom substantially.

### Vehicle art pipeline

The vehicle renderer now uses authored pixel art first and the procedural SVG system only as a fallback for cars whose artwork has not been completed yet.

The first in-game sprite sheet contains top-down assets for:

- 1998 Honda Civic DX
- 2003 Nissan 350Z
- 2004 Subaru Impreza WRX STI
- 2005 Ford Mustang GT

Vehicle metadata is view-aware. The renderer can request a `topDown`, `showroom`, or `racePreview` view and falls back to the available top-down asset until a dedicated angle exists. The same structure can later contain stage-specific frames, so Build Stage visual changes do not require changes to game screens.

`assets/js/ui/vehicleRenderer.js` still draws the existing procedural side-profile placeholder for catalog cars without authored sprite art. This lets the vehicle catalog grow independently from the art backlog.

## Runtime modes

### Static development mode — GitHub Pages

The committed playable build lives in `/docs` and contains static HTML/CSS/JavaScript/data files only.

- Storage provider: `LocalStorageProvider`
- Save data: browser `localStorage`
- Simulated local development identity
- No shared accounts/player state
- Intended for gameplay, UI and system testing

Do not edit `/docs` by hand. Generate it from shared source:

```bash
php scripts/build-static.php
```

### Server mode — PHP prototype

The repository root remains the PHP/server build.

- Storage provider: `ApiStorageProvider`
- PHP sessions/authentication
- CSRF-protected write API
- Atomic JSON player/runtime persistence
- SQL/database migration planned later

Username matching is case-insensitive in both development runtime modes. A future real account/database system must also enforce case-insensitive canonical username uniqueness at registration time.

## Shared provider architecture

Screens depend on the storage/game gateway instead of knowing which persistence mode is active:

```text
assets/js/storage/
  StorageProvider.js
  ApiStorageProvider.js
  LocalStorageProvider.js
  createStorageProvider.js
```

Gameplay rules are mirrored between the browser-local `LocalGameService` and PHP `GameService`, with automated tests covering both paths.

## Repository layout

```text
.github/workflows/     automated validation
api/                   PHP HTTP API
app/                   PHP auth, JSON store, game service, config
assets/                shared authored frontend
  js/domain/           browser-local game service
  js/storage/          runtime provider abstraction
  js/ui/               shared UI + procedural vehicle renderer
data/
  catalog/             cars, engines and stage-aware parts
  config/              game + Build Stage configuration
  players/             generated server player saves (ignored)
  runtime/             generated server runtime state (ignored)
docs/                  generated GitHub Pages build
scripts/               build and smoke/integration tests
```

## Visual QA workflow

CI now uploads the generated static `/docs` build as a PR preview artifact. Before visually significant changes are merged, that exact artifact can be downloaded and run in Chromium at desktop/mobile viewport sizes for a real click-through check rather than relying only on syntax/game-logic tests.

## Validation

PRs run the `Validate Forever Racing` workflow. It checks:

```text
PHP syntax
JavaScript syntax
case-insensitive server login
browser-local FTUE + Build Stage flow
authenticated PHP API FTUE flow
GitHub Pages static build generation
static-build/module smoke tests
```

Useful local commands:

```bash
find . -path './docs' -prune -o -name '*.php' -type f -print0 | xargs -0 -n1 php -l
find assets/js -name '*.js' -type f -print0 | xargs -0 -n1 node --check
php scripts/test-auth-case.php
node --experimental-default-type=module scripts/test-local-game.mjs
bash scripts/test-api.sh
php scripts/build-static.php
node --experimental-vm-modules scripts/test-static.mjs
```

## Development workflow

GitHub is the canonical source repository. Inspect current `main` at the start of every development session.

Meaningful features should be developed on feature branches, validated, committed, and landed through pull requests. `main` should represent the current stable development version.

Never commit real credentials, API secrets, private keys, production player data, or real user save data.
