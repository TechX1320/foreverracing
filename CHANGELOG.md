# Changelog

## V0.4.0-c — readability hardening

- Made the compact game header actually 50px tall instead of only lowering its minimum height.
- Reclaimed the corresponding desktop gameplay height while preserving the no-scroll browser-MMO target.
- Established a 10px floor for compact metadata and raised supporting text where V0.4B still left 7–9px labels.
- Increased tiny race, home, data-list, vehicle-art and navigation metadata without turning the UI into oversized cards.
- Replaced remaining player-facing Build Stage / Stage 1 language with Street Car, Street Race Car and Build Type terminology.
- Kept drag-racing staging language (PRE-STAGE / STAGED) intact because it describes the race process, not vehicle build progression.
- Added static regression checks for the compact header, readability hardening and named build terminology.
- Preserved the V0.4B Garage Inventory, category Parts, Classifieds, reactive build conversion and two-phase race systems unchanged.

## V0.4.0-b — browser-game usability pass

- Increased global text sizing and control readability.
- Removed the oversized top player/current-car stat strip and moved Player Info into the right context rail.
- Made the orange navigation indicator follow the current route.
- Hid Showroom after starter FTUE until a meaningful new-car catalog exists.
- Replaced the long Parts table with compact category buttons and focused category shopping dialogs.
- Moved install/remove/swap actions out of the Parts Shop and into per-car Garage Inventory.
- Added car-scoped part ownership metadata for newly purchased parts.
- Reworked build progression names to Street Car, Street Race Car, Front-Half Race Car and Full Race Car.
- Removed the premature Build Stages FTUE lecture; build conversion is now prompted reactively after the Street Car is actually complete.
- Renamed the Used Lot presentation to Classifieds and rebuilt it around image-first listing cards + More Details purchase dialogs.
- Added separate mileage and condition pricing factors to Classifieds listings.
- Shortened the race presentation for 1080p layouts and corrected track-layer ordering so start/finish markings render behind cars.
- Added V0.4B browser-local/PHP/static regression coverage.
- Tracked the current starter side-profile tire/rubber artwork defect for the next authored-art pass.

## V0.4.0-a — blocking real-time race presentation

- Replaced instant race-result delivery with a persistent two-phase start/finish lifecycle.
- Added a modal race presentation that blocks the rest of the game while the pass runs.
- Added pre-stage/stage/tree/green/red-light presentation, live race clock, top-down two-lane car movement and per-lane progress bars.
- Race playback uses the simulated reaction time and ET at real 1× time by default.
- Credits, EXP, REP, records, statistics and race history are awarded only after the race finish timestamp.
- Repeated race starts return the already-active pass instead of creating duplicate results or rewards.
- Added idempotent finish behavior so retries cannot duplicate payouts.
- Active races persist through refresh/reload and automatically resume in Quick Race.
- Added global route locking while an active race exists.
- Added opponent race artwork selection from the authored top-down catalog.
- Added browser-local, PHP API and static-build regression coverage for the two-phase race lifecycle.
- Documented the external race-presentation research used to choose the V0.4A interaction model.

## V0.3.0-b — TextTuned race core + disposable Admin sessions

- Replaced the placeholder Quick Race formula with dedicated browser/PHP race simulator modules derived from surviving TextTuned race logic.
- Added automated 1/4-mile, 1/2-mile and 1-mile racing.
- Added reaction time, red-light fouls, elapsed time, total time and trap speed.
- Added launch consistency, level-based shifting loss, engine variability, grip influence and slippery-weather behavior.
- Ported TextTuned's weighted world locations, normal/severe weather and rare nightmare conditions.
- Added generated opponents matched around the player's current power-to-weight.
- Added per-car pass counts, best ETs and best trap speeds for all three distances.
- Added recent race history and a dense timing-board result UI.
- Added EXP race rewards and TextTuned's level threshold curve while retaining Forever Racing REP.
- Made Admin a disposable FTUE development account: signing out wipes its player save so the next login starts fresh.
- Added local duplicate-login prevention and a server-side active-session registry that rejects a second active login.
- Added regression coverage for race distances, EXP/records/history, duplicate sessions and Admin reset behavior.
- Hardened the fresh-login FTUE welcome so it retries after the login dialog closes instead of occasionally leaving a reset Admin on the Home screen without the Welcome modal.

## V0.3.0-a — starter dual-view art + cache cleanup

- Added side-profile pixel art for all three FTUE starters: 1998 Civic DX, 2005 Mustang GT and 2003 350Z.
- Added fresh top-down race art for the Civic and Mustang; retained the working 350Z race sprite.
- Showroom, Garage and Parts now strictly require side-profile/showroom art and never silently display a top-down race sprite.
- Race previews strictly use race-preview/top-down art.
- Vehicle asset URLs include the current build as a cache-busting query parameter.
- GitHub Pages/local development mode automatically unregisters the old offline service worker and clears Forever Racing shell caches.
- Settings now includes a manual Clear Cached Assets development control and visible build identifier.
- Showroom refreshes its catalog from the active provider each time it opens.

## V0.2.0-dev.5 — honest art fallback + TextTuned roadmap

- Removed the generic procedural-car fallback from normal vehicle rendering.
- Cars with no authored art now display an explicit boxed `? / ART MISSING` placeholder.
- Broken direct image assets automatically reveal the same missing-art marker instead of leaving a blank row.
- Added the long-term vehicle view contract: side profile for showroom/garage presentation, top-down for racing, with dedicated view overrides supported.
- Added an eight-car art queue covering every current catalog car without authored art.
- Audited the surviving private TextTuned server source and added a feature-by-feature migration roadmap for bringing its MMORPG systems into Forever Racing.
- Set V0.3 direction to a cleaned-up TextTuned-derived automated race core before deeper visual polish.

## V0.2.0-dev.4 — pixel car rendering hotfix

- Fixed authored car sprites rendering as tiny/incomplete CSS sprite-sheet slices in the Showroom.
- Added one transparent PNG per authored vehicle and made direct image files the preferred rendering path.
- Preserved the contact sprite sheet as an asset-management/fallback format instead of the primary UI renderer.
- Browser-tested the FTUE Showroom at desktop and mobile widths before merge.
- Added a PR preview artifact to CI so future UI/gameplay changes can be downloaded and visually played in Chromium before approval.

## V0.2.0-dev.3 — first pixel car assets

- Added the first authored pixel car sprite sheet to the real game build.
- Replaced procedural placeholders for the 1998 Civic DX, 2003 350Z, 2004 WRX STI and 2005 Mustang GT with top-down pixel sprites.
- Added view-aware vehicle asset metadata so cars can later define separate `topDown`, `showroom`, `racePreview` and stage-specific artwork without changing screen logic.
- Updated the shared vehicle renderer to prefer authored sprites and retain procedural SVG only as a fallback for cars without finished art.
- Added automatic visual metadata migration so cars already owned in browser/server saves pick up newly-authored artwork after an update.
- Added pixel-art rendering/scaling rules for Home, Showroom, Garage, Parts and race previews.
- Added the sprite sheet to offline/static caching and static-build validation.

## V0.2.0-dev.2 — game identity, FTUE and Build Stages

- Replaced the glass-card/AI-dashboard presentation with a denser browser-game layout: persistent player/current-car status, compact navigation, flatter panels, thin separators and table/list-heavy screens.
- Made compact navigation the default on desktop/mobile/foldable layouts.
- Added a persistent FTUE: welcome, starter selection, Garage explanation, first upgrade, install, Build Stage explanation, first race and completion reward.
- Added FTUE route locking so onboarding cannot be bypassed through alternate navigation buttons.
- Added a development Reset Tutorial control.
- Made username matching case-insensitive in both PHP/server and static/local development modes.
- Added player progression fields for level and reputation.
- Replaced the generic parts catalog with 21 Stage 1 upgrades across seven required categories and the first 14 Stage 2 choice-based parts.
- Enforced Stage 1 sequential progression, permanent no-downgrade behavior and all-category completion before Stage 2.
- Added the Stage 1 -> Stage 2 conversion: the completed Stage 1 setup becomes the new baseline and simple Stage 1 parts are incorporated into the conversion.
- Added Build Stage 1-4 configuration and vehicle/engine compatibility schema groundwork for future engine swaps.
- Added an engine catalog with displacement, size-class, orientation and aspiration metadata.
- Added per-vehicle engine-bay, starter-car and procedural-visual metadata.
- Added a procedural SVG side-profile vehicle renderer with visible Stage 2/3/4 race-prep cues.
- Integrated procedural vehicles into Home, Showroom, Garage, Parts and Quick Race.
- Rebuilt Showroom, Garage and Parts around denser game-oriented rows/progression views and explicit projected stat changes.
- Added authenticated PHP FTUE API tests, browser-local FTUE/Build Stage tests, case-insensitive auth tests and GitHub Actions PR validation.
- Bumped the service-worker cache and static-build requirements for the new assets/data.

## V0.2.0-dev.1 — dual-runtime foundation

- Imported the V1 clean-room prototype as the server-mode baseline.
- Added a runtime storage gateway so screens no longer depend directly on PHP endpoints.
- Added `StorageProvider`, `ApiStorageProvider`, and `LocalStorageProvider` implementations.
- Added a browser-local game service for the GitHub Pages development build.
- Moved shared prototype runtime/economy constants into `data/config/game.json`.
- Added a generated `/docs` build configured for browser-local persistence on GitHub Pages.
- Added a static build script and smoke tests for the static shell and local gameplay flow.
- Updated the service worker so the same authored frontend can operate in server or static mode.
- Added `.gitignore` protection for generated player/runtime data and common secret/private-key files.
- Preserved PHP sessions, CSRF protection, JSON persistence, showroom, garage, parts, used lot, Quick Race, and RogueLike behavior in server mode.

## 2026.09.26 — V1 clean-room rebuild

- Rebuilt Forever Racing from scratch from the product history rather than old prototype source.
- Added mandatory server-side authentication and CSRF-protected write actions.
- Replaced client-only player state with atomic JSON persistence that can later be swapped for SQL repositories.
- Added responsive Home UI for desktop, phones, foldables and tablets.
- Added SPA-style hash routing and progressive View Transitions.
- Added working Showroom, Garage, Parts Shop, Used Car Lot, Quick Race and RogueLike prototype loops.
- Added Events, Teams, Leaderboards and Multiplayer shells.
- Added local UI settings, PWA manifest and service-worker groundwork.
- Kept visual racing isolated so it can be built later without rewriting ownership/economy systems.
