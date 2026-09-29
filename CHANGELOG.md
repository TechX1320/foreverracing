# Changelog

## V0.4.0-f.1 — starter visual certification hotfix

- Replaced the broken starter-layer runtime presentation with certified Golf GTI, Mazda RX-8 and Renault Clio V6 Sport composite PNGs.
- Kept body / wheel / rim / detail metadata intact for future paint and wheel customization work.
- Added Settings -> Car Art Debug for fast starter-art verification.
- Added BUY + INSTALL as the primary Parts action while retaining BUY ONLY and Garage Inventory for later swapping/management.
- Existing owned parts can now be installed directly from the Parts shop.
- The tutorial now purchases + installs the first Intake in one action and proceeds directly to the first 1/4-mile race.
- Tightened the visible tutorial from six actions to five.
- Wheel-spin animation remains deferred polish.

## V0.4.0-f — layered vehicle visual reset

- Replaced the generated/legacy vehicle presentation pipeline with purchased layered side-profile art.
- Added a 57-car art manifest describing body, tire/brake, rim and non-paintable detail layers plus wheel, ground and bumper anchors.
- Corrected auto-generated wheel placement by lowering wheel centers to expose more tire instead of producing an overly slammed stance.
- Reset the playable vehicle catalog to three fully validated starter cars: Volkswagen Golf GTI Mk6, Mazda RX-8 and Renault Clio V6 Sport.
- Stored supplied OEM engine/output/redline data for all three starters without inventing model years.
- Rebuilt the shared vehicle renderer as a layered compositor reused by Classifieds, Garage, Parts, Race Preview and racing.
- Changed race presentation from top-down/vertical to side-view/horizontal because the purchased pack is side-profile only.
- Staging aligns the front tire to the start plane; timing ends when the front-bumper anchor crosses the finish plane.
- Cars continue visually through the finish after timing stops for a proper fly-through effect.
- Added a deterministic 51-pass hidden stock quarter-mile benchmark and Performance Index: 8 PI per 0.1 second.
- Removed temporary letter-class assumptions from current starter/tutorial presentation.
- Race Preview now exposes PI, drivetrain and build type while hiding opponent HP, torque and weight.
- Quick Race and The Circuit use PI as the temporary common performance/matchmaking language.
- Preserved the guaranteed clean tutorial first-race win and two-phase/idempotent race transaction lifecycle.
- Imported the three starter layer sets into runtime and GitHub Pages assets; the remaining purchased cars stay cataloged for later validation.

## V0.4.0-e — Race Preview and dialog cleanup

- Replaced player-facing FTUE jargon with plain Step / tutorial language.
- Fixed the shared dialog-shell width mismatch that made Classifieds purchase, Parts purchase and Garage Inventory appear as tiny scrollable windows.
- Kept wide desktop dialogs fully visible inside the viewport while preserving mobile scrolling when genuinely needed.
- Added a deterministic next-opponent preview shared by browser-local and PHP runtimes.
- Quick Race now shows a compact You vs Next Opponent Race Preview instead of a large duplicate current-car panel.
- The opponent shown before the race is the same generated opponent used when the race starts.
- Converted the distance controls into the actual Start Race actions and removed the redundant lower race button.
- Next-race actions therefore remain visible at the top even after a result card is shown.
- Kept the tutorial first race as a guaranteed clean win; automated tests explicitly verify the win and preview-to-race opponent match.
- Recent passes remain collapsed by default so race results do not continually grow the page.

## V0.4.0-d — guided FTUE and progression

- Rebuilt the FTUE as a forced action path instead of a collection of small instructional panels.
- Moved first-car selection from Showroom to three guaranteed D Class starter listings in Classifieds.
- Starter progression now begins with a used Civic / RSX / Miata-style beater instead of C Class Mustang/350Z options.
- Rebuilt Showroom around the same image-first card language as Classifieds and limited it to newer dealer inventory.
- Added Suspension as the eighth Street Car category, completing a clean 4x2 category grid.
- Forced the first upgrade to Stage 1 Intake and automatically routes purchase -> Garage Inventory -> install -> Quick Race.
- Forced the first race to the 1/4 mile, guarantees no red light and a beginner-friendly first win in normal weather.
- Added distance progression: 1/2 mile at Level 5 and 1 mile at Level 10.
- Added level-based navigation gates so FTUE completion no longer unlocks the entire game at once.
- Renamed the player-facing RogueLike prototype to The Circuit and established it as the future single-player career shell.
- Raised normal desktop metadata/supporting text again; V0.4C's 10px floor was still too small.
- Reworked Parts and Garage Inventory dialogs around large actions and clearer information hierarchy.
- Collapsed secondary Quick Race information to reduce page scrolling.
- Tiered Quick Race weather and excluded nightmare/extreme scenarios from early normal races.
- Fixed drag-tree timing so ambers count down distinctly and a red light appears immediately on an early launch.
- Preserved the two-phase/idempotent race transaction and LocalStorage/PHP parity.
- Deferred vehicle tire/pixel-art replacement to a dedicated art-direction pass using future supplied references.

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
