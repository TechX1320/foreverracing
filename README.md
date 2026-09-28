# Forever Racing

Forever Racing is a systems-first browser drag-racing / garage-management game inspired by the earlier TextTuned Discord game.

Forever Racing uses one shared frontend with two interchangeable runtime/persistence modes: a browser-local GitHub Pages development build and a PHP-backed server build for eventual hosted accounts/player data.

## Live development build

GitHub Pages:

`https://techx1320.github.io/foreverracing/`

Development credentials: `Admin` / `12345`.

The Pages build is intentionally local-only. Its login is a simulated development identity and saves are stored in the current browser. They are not shared across browsers or devices.

## V0.4.0-e playable direction

This build is the first gameplay/identity pass after the dual-runtime foundation.

### Game UI

- Readability remains a first-class constraint: V0.4D stops treating 10px as an acceptable desktop floor. Compact metadata is generally 11–12px+, supporting copy is 13px+, and viewport space is recovered by focusing/collapsing content instead of shrinking text.
- Desktop removes the oversized top player/current-car strip. Player Info lives in the right context rail under Build Rules.
- The active navigation item owns the orange indicator; it follows the current route instead of remaining on Home.
- Desktop screens are designed around a no-page-scroll target at 1080p+ for normal gameplay surfaces.
- Mobile/foldable layouts keep the same information hierarchy while stacking compactly.
- The visual language remains flat and dense: thin separators, restrained orange accents, compact panels and browser-MMO information density.

### First-time user experience

New development profiles receive an action-first six-step tutorial:

1. Welcome / choose **SELECT FIRST CAR**.
2. Pick one of three used **D Class** starter listings in Classifieds.
3. Inspect the first car in Garage and continue through the large guided action.
4. Parts locks every category except **Intake** and forces purchase of the Stage 1 Intake.
5. Garage Inventory opens automatically and forces installation of that Intake.
6. Quick Race locks to the **1/4 mile**, guarantees a clean first launch in normal weather, and completes the basics.

The tutorial is intentionally restrictive: new players are shown one action at a time rather than being asked to explore menus while learning the core loop. Build conversion remains reactive later, when the Street Car actually has every required category maxed.

Tutorial state is stored with the player. Settings includes a development-only Reset Tutorial action.

### Build Types

#### Street Car

The car retains its production shell/layout and uses a simple three-step progression in eight required categories:

- Intake
- Exhaust
- ECU
- Fuel
- Drivetrain
- Suspension
- Tires
- Weight Reduction

Street Car rules:

- Upgrade steps are purchased in order: 1 -> 2 -> 3.
- The Parts category dialog shows projected HP / torque / weight before purchase.
- Buying a part puts it in that car's Garage Inventory; installation happens in the Garage.
- An installed Street Car ladder step cannot be downgraded.
- Once all eight categories reach Step 3, the game reactively asks whether to upgrade the car into a Street Race Car.

#### Street Race Car

The completed Street Car setup is absorbed into the permanent baseline.

A Street Race Car:

- keeps the recognizable stock body;
- can be gutted/caged and become questionably street legal;
- replaces the numbered ladder with named, choice-based parts;
- keeps purchased race parts available for future higher build types.

#### Front-Half Race Car / Full Race Car groundwork

Front-Half Race Car and Full Race Car remain schema/design groundwork rather than complete playable progression steps.

The vehicle/engine model already has groundwork for engine-bay size, transverse/longitudinal orientation, factory displacement and stage-specific displacement allowance. Front-Half Race Car is intended to unlock physically sensible engine swaps; Full Race Car widens chassis/powertrain freedom further.

### Parts and Garage Inventory

The Parts screen is a compact category launcher rather than one long upgrade table. Opening Intake, Exhaust, Tires, etc. creates a focused shopping dialog with the current car, its stats, projected results and the relevant purchasable options.

The shop only purchases parts. Owned parts are marked **OWNED**. Installation/removal/swapping happens from **Garage -> Inventory** on the car itself.

### Classifieds and Showroom

**Classifieds** is the home for older/used vehicles and eventually player listings. It is also where a new player gets their first car.

- The tutorial guarantees three D Class starter listings and filters out higher-class starter choices.
- Starter cars are intentionally used, high-mileage, imperfect cars: the progression fantasy starts at the bottom.
- Listing cards are image-first and open a full details/purchase dialog.
- Mileage and condition use separate visible price factors.
- **Showroom** is now a separate newer/dealer-car experience using the same image-first card language and unlocks later.

### Early progression gates

Completing the tutorial no longer opens every system at once. The initial progression map is intentionally simple and easy to rebalance:

- Level 1: Garage, Parts, Classifieds, 1/4-mile Quick Race, The Circuit.
- Level 3: Records.
- Level 5: Showroom, Teams, 1/2-mile Quick Race.
- Level 7: Events.
- Level 10: Multiplayer and 1-mile Quick Race.

**The Circuit** is the player-facing name for the current PvE prototype. Its seven-stage mechanic remains temporary scaffolding; the long-term direction is a single-player career through local meets, recurring NPCs, crews, rivals, increasingly professional events and faster cars.

### V0.4E interaction cleanup

- Player-facing onboarding uses **STEP 1/6 ... STEP 6/6** rather than developer terminology.
- Classifieds purchase, Parts purchase and Garage Inventory dialogs size to their actual desktop content instead of overflowing a smaller shared dialog shell.
- Quick Race has one action layer: **START 1/4 MI / START 1/2 MI / START 1 MI**. There is no second race button below the car.
- Race Preview shows the player's compact build summary beside the deterministic next opponent. The preview opponent is reused when the race starts.
- The first tutorial race remains a guaranteed clean win.

### V0.4A — real-time race presentation

V0.4A makes automated racing feel like an actual event instead of an instant API result.

- Starting a race creates one persistent `activeRace` instead of immediately granting rewards.
- A blocking race dialog takes over the game while the pass is running.
- The presentation includes pre-stage/stage, a drag tree, green/red-light state, two top-down cars moving down the strip, live progress bars and a race clock.
- The animation runs for the simulated race duration at 1× time by default; a quarter-mile pass therefore takes roughly the amount of time represented by its reaction time + ET, plus staging.
- Credits, EXP, REP, race history and per-car records are committed only after the stored finish timestamp.
- Repeated clicks cannot create multiple races. Starting again while a pass is active returns the same race.
- Refreshing or reopening the game during a pass resumes the stored race rather than generating a new result.
- While an active race exists, routing is locked to Quick Race so the race cannot be bypassed by changing screens.
- The timing slip is revealed only after both cars reach the finish, then the player explicitly returns to the pits.

The presentation is deliberately separate from the simulation. Future launch/shift/NOS input can drive the same race state without replacing the persistence or results model.

### V0.3B — TextTuned race core

V0.3B replaces the placeholder Quick Race calculation with the first cleaned-up browser port of TextTuned's automated drag-racing model.

- Select 1/4 mile, 1/2 mile or 1 mile.
- Each race generates a shared weighted location and weather condition.
- Results include reaction time, elapsed time, trap speed, total time and red-light fouls.
- The simulation uses power-to-weight, torque/weight launch behavior, grip, shift loss, engine variability and weather.
- Opponents are generated near the current car's performance rather than being a fixed dummy.
- Each car stores pass count, best ET and best trap for every distance.
- Recent race history is stored on the player.
- Race rewards now include EXP in addition to credits and REP.
- Player level uses TextTuned's `floor(100 * level^1.75)` EXP threshold curve.
- The race simulator is isolated from the screen so future player-input racing can provide launch/shift/NOS decisions without replacing the automated race core.

The approved V0.3A visual reference remains the UI target; the new Quick Race timing board is the first gameplay screen moving toward that race presentation.

### Disposable Admin development account

`Admin` / `12345` is intentionally a fresh-start development identity.

- **SIGN OUT erases the Admin player save.** The next login begins at the Welcome FTUE with an empty Garage.
- GitHub Pages prevents another login attempt while that browser already has an authenticated local Admin session.
- PHP/server mode keeps a short-lived active-session registry and rejects a second active login for the same account.
- Server session locks expire if abandoned so development cannot be permanently locked out.
- These reset semantics are specific to the development Admin identity; normal future player accounts must preserve their saves on logout.

### V0.3A starter art contract

All three starter cars now have both a side-profile presentation asset and top-down race asset. Showroom/Garage/Parts never borrow top-down race art; missing side art shows the explicit missing-art marker. Quick Race/race contexts never borrow side-profile art.

Static GitHub Pages development mode also disables/unregisters the offline service worker cache and version-tags authored image URLs, so a normal reload should pull the current build instead of requiring a sign-out/sign-in cycle.

### Vehicle art pipeline

The vehicle renderer uses authored art when it exists. Cars without finished artwork now show an explicit boxed `? / ART MISSING` marker instead of a generic fake car.

The first in-game sprite sheet contains top-down assets for:

- 1998 Honda Civic DX
- 2003 Nissan 350Z
- 2004 Subaru Impreza WRX STI
- 2005 Ford Mustang GT

Vehicle metadata is view-aware. Showroom/Garage presentation can prefer `sideProfile`; racing can prefer `topDown`; dedicated `showroom` and `racePreview` overrides remain supported. The same structure can later contain stage-specific frames.

Missing artwork is deliberately obvious so unfinished catalog cars are easy to find during development. See `assets/art/cars/README.md` for the art contract and current queue.

## TextTuned migration

Forever Racing is explicitly the browser successor to the TextTuned Discord MMORPG. The surviving `TechX1320/TextTuned-Server` repository has been inventoried and mapped into the browser project.

See `TEXTTUNED_MIGRATION.md` for the feature-by-feature migration plan and implementation order.

## Runtime modes

### Static development mode — GitHub Pages

The committed playable build lives in `/docs` and contains static HTML/CSS/JavaScript/data files only.

- Storage provider: `LocalStorageProvider`
- Save data: browser `localStorage`
- Simulated local development identity
- Admin save is intentionally erased on sign-out for repeatable FTUE testing
- No shared accounts/player state
- Intended for gameplay, UI and system testing

Do not edit `/docs` by hand. Generate it from shared source:

```bash
php scripts/build-static.php
```

### Server mode — PHP prototype

The repository root remains the PHP/server build.

- Storage provider: `ApiStorageProvider`
- PHP sessions/authentication with one active session per account
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
browser-local FTUE + Build Stage + two-phase animated race lifecycle
authenticated PHP API FTUE + duplicate-session + delayed race finish + Admin-reset flow
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
