# Forever Racing

Forever Racing is a browser-based drag-racing / garage-management game inspired by the earlier TextTuned Discord game.

V0.2 is being developed as one frontend with two interchangeable runtime/persistence modes: a browser-local GitHub Pages development build and a PHP-backed server build for eventual hosted accounts/player data.

## Current playable systems

- Required development login; no guest-mode game UI.
- Showroom purchases.
- Garage selection and nicknames.
- Parts inventory, installation, slot replacement, and derived stat recalculation.
- Rotating Used Car Lot.
- Quick Race text simulation.
- Early RogueLike run prototype.
- Events, Teams, Multiplayer, and Leaderboards shells.
- Responsive phone, foldable, tablet, and desktop UI.
- PWA/service-worker groundwork.

## Runtime modes

### Static development mode — GitHub Pages

The committed playable build lives in `/docs` and contains only static HTML/CSS/JavaScript/data files.

- Storage mode: `local`
- Save data: browser `localStorage`
- Identity: simulated local development login
- Development credentials: `Admin` / `12345`
- No shared accounts or shared player state
- Intended only for gameplay, UI, and system testing

Expected development URL once Pages is enabled:

`https://techx1320.github.io/foreverracing/`

Do not edit `/docs` by hand. It is generated from the shared source with:

```bash
php scripts/build-static.php
```

### Server mode — PHP prototype

The repository root remains the PHP/server build.

- Storage mode: `api`
- PHP sessions/authentication
- CSRF-protected write API
- Atomic JSON player/runtime persistence
- SQL/database migration planned later

Requirements: PHP 8.1+ and write access for `data/players/` and `data/runtime/`.

## Storage/provider architecture

Screens use one gateway contract and do not know which persistence mode is active:

```text
assets/js/storage/
  StorageProvider.js
  ApiStorageProvider.js
  LocalStorageProvider.js
  createStorageProvider.js
```

`ApiStorageProvider` delegates to the existing PHP API. `LocalStorageProvider` supplies the same interface for the static development build. The authored screens, routing, UI, catalogs, and frontend systems are shared.

Shared prototype constants are stored in `data/config/game.json` so important values such as starting credits and Used Lot refresh timing do not silently drift between modes.

## Repository layout

```text
api/                  PHP HTTP API
app/                  PHP auth, JSON store, game service, config
assets/               shared authored frontend
  js/storage/         runtime provider abstraction
  js/domain/          local static-mode game service
data/
  catalog/            shared car + part catalogs
  config/             shared non-secret game config
  players/            generated server player saves (ignored)
  runtime/            generated server runtime state (ignored)
docs/                 generated GitHub Pages build
scripts/               static build + smoke tests
```

## V0.2 direction

1. Preserve the working V1 gameplay loops while cleaning architecture.
2. Redesign toward a compact garage-management browser game.
3. Add persistent FTUE/tutorial progression.
4. Add Build Stages 1–4 and stage-aware parts.
5. Separate engine and chassis ownership/configuration.
6. Prototype displacement-based engine-swap rules:
   - Stage 3: factory displacement ±0.6 L
   - Stage 4: factory displacement ±1.0 L
7. Prototype procedural side-profile vehicle rendering.
8. Keep racing text/simulation-first while core progression is built.

## Development workflow

GitHub is the canonical source repository. At the start of a development session, inspect the current repository before editing because it may have advanced since the previous chat/build.

Meaningful features should be developed on feature branches, tested, committed, and landed through pull requests. `main` should remain the current stable development version.

Never commit real credentials, API secrets, private keys, production player data, or real user save data.

## Tests used for this foundation

```bash
# PHP syntax
find . -path './docs' -prune -o -name '*.php' -type f -print0 | xargs -0 -n1 php -l

# JavaScript syntax
find assets/js -name '*.js' -type f -exec node --check {} \;

# Static build
php scripts/build-static.php
node --experimental-vm-modules scripts/test-static.mjs

# Local gameplay engine
node --experimental-default-type=module scripts/test-local-game.mjs
```

The PHP API is also smoke-tested through an authenticated local HTTP session for catalog, car purchase, part purchase/install, and Quick Race state mutation.
