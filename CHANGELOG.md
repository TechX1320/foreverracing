# Changelog

## V0.5.0-g — Garage tuning

- Standalone ECU + Laptop now unlocks a dedicated TUNING action in the Home Garage for that car.
- Added adjustable boost target, fuel trim, ignition advance, launch RPM, shift RPM, front/rear tire PSI and six-gear boost-by-gear control.
- Boost, fuel and timing alter power/torque; tire PSI alters usable grip; boost-by-gear changes launch traction demand; launch/shift RPM affect ET.
- Added tune stability/risk. Aggressive calibrations can make more peak power but intermittently pull power on individual passes.
- Added per-owned-car calibration fingerprints, so the same copied tune does not evaluate identically on every example of the same car.
- Added live laptop diagnostics with directional fuel/timing/tire/launch/shift feedback rather than exposing the exact hidden sweet spot.
- Added post-race tune telemetry for boost, first-gear delivery, wheel slip, stability and ECU power-pull events.
- Tuning behavior is mirrored in local/browser mode and the PHP server game path.


## V0.5.0-f — Stage 3/4 parts depth

- Expanded the catalog from 72 to 135 parts, with Stage 3 and Stage 4 now carrying real depth outside Forced Induction.
- Added shop subcategories and three-part pagination to normal Parts modals plus pagination to Forced Induction system pages.
- Added deeper Intake, Exhaust, Fuel, ECU, Drivetrain, Suspension, Tires and Weight Reduction paths across Front-Half and Full Race builds.
- Added Stage 4 Engine internals with piston-engine and rotary-specific paths; RX-8s now receive rotary seals, porting, rotors and eccentric-shaft parts instead of piston/valvetrain hardware.
- Added standalone ECU + laptop hardware groundwork for the later home-garage tuning system.
- Added progressive drag tire, clutch, flywheel, transmission, differential and chassis choices.
- Balanced a strong single-turbo/no-NOS Stage 4 RX-8 build into the low-8-second 1/4-mile neighborhood under the current simulator.
- Clarified that engine swaps are planned for the next powertrain-system pass rather than claiming the current Stage 3/4 UI already supports them.


## V0.5.0-e — Parts Creator MVP

- Activated Parts Creator as the third Content Studio authoring module.
- Added create, edit, clone, local draft/activation, JSON export/copy, and live test-car previews.
- Added engine-first compatibility with exact engine IDs, car include/exclude rules, build stages, aspiration, configuration and engine tags.
- Added requirements/conflicts metadata and active/scheduled/deprecated/retired part lifecycle.
- Added live HP/TQ/weight/grip/PI previews for authored effects.
- Activated local Parts Creator definitions in the browser-local Parts shop after page reload.
- Enforced authored compatibility, requirements/conflicts and lifecycle in local gameplay and server purchase/install validation.


## V0.5.0-d.1 — parts depth and UX

- Kept Stage 1 category modals open after Buy + Install.
- Added four progressive Engine Kits and Engine Kit requirements to higher boost/NOS upgrades.
- Added selectable before/after dyno previews to Forced Induction parts.
- Reduced Forced Induction modal scrolling by showing current/next progressive upgrades and using a split desktop workspace.
- Added explicit click affordance to Turbo/Supercharger/NOS system cards.
- Switched Street Race Car+ category layout to a 3-column grid and clarified that earlier-stage parts remain available after advancing.
- Added a 10,000,000 CR minimum balance for the Admin development account.
- Preserved Engine Creator power-curve data in car engine snapshots.


## V0.5.0-d — forced-induction foundation

- Added staged Turbo, Supercharger and NOS gameplay systems starting at Street Race Car.
- Added factory-boosted upgrade paths, aftermarket kit swapping, Stage 3 component upgrades and Stage 4 twin charging.
- Added 50 through 300 shot NOS progression by build type.
- Added confirmation and automatic uninstall behavior when swapping primary forced-induction systems.
- Enabled Street Race Car → Front-Half Race Car → Full Race Car progression.
- Added live Car Creator engine-list refresh without a full page reload.
- Added matching local/server compatibility rules and regression coverage.


## V0.5.0-c.3 — composite race-art fallback

- Fixed certified/atlas-only cars disappearing in side-view race playback.
- Animated-wheel requests now fall back to static certified art when body/wheel layer assets are unavailable.
- Car Creator now marks composite-only cars as fixed-livery / paint locked instead of exposing nonfunctional paint controls.
- Added visual-capability detection for paintable, layered, certified, and animated-wheel support.


## V0.5.0-c.2 — factory peak boost

- Added optional Factory Peak Boost (PSI) to boosted Engine Creator definitions.
- Car Creator carries and displays the linked engine's factory boost baseline.
- Boost remains reference metadata; HP/TQ anchors and the torque curve are still authored directly.
- Establishes the baseline needed for future forced-induction tuning features.


## V0.5.0-c.1 — Engine Creator simplification

- Removed unused compression ratio, engine weight, physical size-class and orientation authoring.
- Standardized future swap fitment around displacement allowances plus explicit compatibility exceptions.
- Replaced curve-evidence selection with gameplay-oriented curve profiles.
- Added nine baseline profiles including Small / Economy, Turbo Street, Muscle V8, JDM VTEC, High-Rev NA, Motorbike, Diesel and Rotary.
- Profile selection now shapes generated torque curves while HP stays derived from torque.
- Migrated the engine catalog to the lighter schema.


## V0.5.0-c — Engine Creator

- Added Engine Creator as a second active Content Studio module.
- Added engine family/variant identity, hardware specs, fitment, tags, peak output anchors, redline/limiter and torque-first power curves.
- Added live dyno-style HP/TQ graphing and deterministic horsepower derivation from torque.
- Added baseline curve generation, validation, local draft/activation and JSON export/copy.
- Linked Car Creator to complete Engine Creator definitions through Factory Engine IDs.
- Migrated the three playable cars to dedicated engine variants and migrated the existing swap-fitment engine catalog into the new schema.
- Preserved the current car physics snapshot for compatibility while establishing engine IDs as the basis for the upcoming Parts Creator compatibility system.

## V0.5.0-b — release scheduling + Parts Creator foundation

- Added per-car Draft / Release Immediately / Scheduled Release controls to Car Creator.
- Unreleased cars are gated from Classifieds, Showroom purchases, and random race-opponent selection in both local and server game services.
- Classifieds expiry now honors the next scheduled car release so scheduled content can enter the pool on time.
- Added reusable ContentRelease lifecycle helpers for future parts, wheels, wraps, and limited content.
- Factory paint swatches now immediately preview their current color when clicked and visually mark the selected swatch.
- Added a detailed Parts Creator architecture covering engine-specific compatibility, build-stage choices, tags, requirements/conflicts, custom parts, and deprecated/replacement parts.

## V0.5.0-a.3 — Content Studio coordinate polish

- Removed the redundant Rear / Front legend from the Car Creator preview.
- Renamed layer X/Y controls to X OFFSET / Y OFFSET.
- Wheel and disk rows now show the default rear/front wheel-center coordinates sourced from each car's art metadata.
- Preserved per-layer X/Y as additive offsets so existing rendering behavior and saved cars remain compatible.

## V0.5.0-a.2 — Content Studio polish

- Fixed Content Studio wheel-anchor markers so certified and atlas previews use the same rendered coordinate space as the visible car.
- Added five editable factory paint colors per car.
- Classifieds can now generate different paint colors for separate listings of the same model and preserve that color after purchase.
- Added default paint palettes to Golf GTI, Mazda RX-8 and Renault Clio.
- Split local authoring into saved drafts versus activated local gameplay cars.
- Activating a car now clears the local used-lot cache so Classifieds regenerate from the updated catalog.
- Clarified Classifieds versus Showroom placement directly in Car Creator.

## V0.5.0-a.1 — Content Studio preview hotfix

- Fixed playable cars being forced into raw layer rendering when first opened in Car Creator.
- Fixed art-roster-only cars disappearing because editable mode was enabled before layer PNGs existed.
- Editable previews now prefer the known-good race PNG layer set for current playable cars while applying authored X/Y/Z transforms.
- Added certified/atlas fallback when editable layer sources are unavailable.
- Added a site favicon to stop the default missing-favicon request.

## V0.5.0-a — Content Studio / Car Creator

- Added the first Content Studio developer surface with Car Creator.
- New cars can be authored from scratch; existing gameplay cars and all 57 art-roster cars can be loaded for editing.
- Added live 51-pass PI/class calculation from the same Performance Index code used by gameplay.
- Added browser PNG uploads for body, wheel, disk and detail layers.
- Added editable canvas, wheel/bumper/ground anchors and per-layer X/Y/Z controls.
- Extended the layered renderer with editor-forced layers, offsets, Z ordering and Layer 1 paint-mask preview.
- Added browser-local Content Studio catalog overrides so saved cars can be reloaded directly into local gameplay for testing.
- Added JSON export/copy workflow for permanent content integration.
- Established Parts Tool and Wheels Tool as the next Content Studio modules.

## V0.4.0-h.4 — physics-linked wheel motion

- Replaced the fixed race-position easing with a per-pass motion curve derived from elapsed time and trap speed.
- Wheel rotation now integrates the same distance traveled as the race presentation, keeping tire speed synchronized with the car.
- Driven-wheel launch slip now multiplies rolling wheel speed using the simulator's wheel-slip telemetry.
- Post-finish fly-through continues from measured trap speed instead of a fixed extra-distance animation.

## V0.4.0-h.3 — race lane centering

- Centered each side-view race car vertically inside its lane instead of using asymmetric lane offsets.
- Fixes the Mazda RX-8 appearing too low in the lower lane while keeping front-wheel staging, front-bumper timing and wheel/smoke animation unchanged.

## V0.4.0-h.2 — wheel spin and grip-loss smoke

- Restored the original CSS drag tree after the purchased sprite-tree experiment.
- Re-centered the road texture so its own white stripe sits at the middle of the strip.
- Repositioned both lanes so the tires ride through the darker rubbered-in grooves.
- Added race-only body / tire / rim / detail PNG layers for all three playable starter cars.
- Wheels and rims now rotate from track travel; extra launch slip is applied only to the driven wheels.
- Added deterministic traction telemetry in both JS and PHP race simulators: grip loss, wheel slip and smoke level.
- Added purchased tire-smoke animation during launch traction loss; FWD smokes front tires, RWD rear tires and AWD both.
- Added X Class at PI 1100+; S Class now covers PI 900-1099.
- Preserved front-wheel staging, front-bumper finish timing and post-finish visual fly-through.

## V0.4.0-h.0 — purchased drag-strip visual pass

- Replaced the placeholder Quick Race strip with the purchased road texture.
- Added purchased track-rail artwork at the strip edges.
- Replaced generated start/finish timing markers with purchased timing-line artwork.
- Replaced the CSS bulb tree with the purchased Christmas-tree sprite sheet and preserved pre-stage / stage / amber / green / red timing states.
- Added purchased under-car shadows that travel with each car.
- Preserved front-wheel staging, front-bumper finish timing and post-finish visual fly-through.
- Wheel rotation and grip-loss smoke remain the next visual passes.

## V0.4.0-g — 57-car art roster and PI classes

- Imported five certified PNG atlas pages covering all 57 purchased vehicle assets.
- Lowered wheel placement again; the certified geometry now uses a 10px total wheel drop from the detected wheel-opening center.
- Replaced the Golf GTI, RX-8 and Clio V6 starter composites with the corrected lower-wheel PNGs.
- Expanded Settings -> Car Art Debug into a 57-car roster showing PLAYABLE vs ART READY state.
- Kept gameplay limited to the three vehicles with validated specs; art-ready cars do not enter the market automatically.
- Added PI-driven D/C/B/A/S classes with temporary thresholds: D < 450, C < 600, B < 750, A < 900, S < 1100, X >= 1100.
- Current starter cars remain D Class and owned-car class updates when PI changes.
- Added class visibility to Classifieds, Garage, Showroom groundwork and Race Preview.

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
