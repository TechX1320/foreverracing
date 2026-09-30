# Forever Racing

Forever Racing is a systems-first browser drag-racing / garage-management game inspired by the earlier TextTuned Discord game.

Forever Racing uses one shared frontend with two interchangeable runtime/persistence modes: a browser-local GitHub Pages development build and a PHP-backed server build for eventual hosted accounts/player data.

## Live development build

GitHub Pages:

`https://techx1320.github.io/foreverracing/`

Development credentials: `Admin` / `12345`.

The Pages build is intentionally local-only. Its login is a simulated development identity and saves are stored in the current browser. They are not shared across browsers or devices.

## V0.5.0-h.2 playable direction

This build is the first gameplay/identity pass after the dual-runtime foundation.

### Game UI

- Readability remains a first-class constraint: V0.4D stops treating 10px as an acceptable desktop floor. Compact metadata is generally 11–12px+, supporting copy is 13px+, and viewport space is recovered by focusing/collapsing content instead of shrinking text.
- Desktop removes the oversized top player/current-car strip. Player Info lives in the right context rail under Build Rules.
- The active navigation item owns the orange indicator; it follows the current route instead of remaining on Home.
- Desktop screens are designed around a no-page-scroll target at 1080p+ for normal gameplay surfaces.
- Mobile/foldable layouts keep the same information hierarchy while stacking compactly.
- The visual language remains flat and dense: thin separators, restrained orange accents, compact panels and browser-MMO information density.

### First-time user experience

New development profiles receive an action-first five-step tutorial:

1. Welcome / choose **SELECT FIRST CAR**.
2. Pick one of three used starter cars in Classifieds: **Golf GTI Mk6, RX-8 or Clio V6 Sport**.
3. Inspect the first car in Garage and continue through the large guided action.
4. Parts locks every category except **Intake** and forces **BUY + INSTALL** on the Stage 1 Intake.
5. Quick Race locks to the **1/4 mile**, guarantees a clean first launch in normal weather, and completes the basics.

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
- **BUY + INSTALL** purchases and applies the part immediately. **BUY ONLY** stores it in that car's Garage Inventory for later.
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

The shop supports **BUY + INSTALL**, **BUY ONLY**, and installing an already-owned compatible part. Garage -> Inventory remains the place for broader swapping/removal/setup management.

### Classifieds and Showroom

**Classifieds** is the home for older/used vehicles and eventually player listings. It is also where a new player gets their first car.

- The tutorial guarantees the three validated layered-art starter listings and hides the broader rotating market until onboarding is complete.
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

### V0.5H.2 swap preview + chassis ownership hardening

- Engine Swap confirmation now sizes the actual dialog to the viewport instead of forcing a wider child panel inside the default modal, removing the horizontal back-and-forth scroll.
- **Tires, Suspension and Weight Reduction are explicit chassis-only categories.** They stay with the car during an engine swap and cannot become attached to a stored engine assembly.
- Save normalization scrubs stale chassis-part engine links if an older/bad save ever contains them.
- Regression coverage now verifies all three chassis-only categories remain on the RX-8 while engine-bound parts and calibration travel with the removed engine.

### V0.5H.1 complete engine assemblies

- Normal/custom swaps now open at **Build Type 2**, so players can choose an engine direction before fully maxing the factory engine.
- Every owned engine is now an individual persistent assembly. A built 1066 hp Renesis is different inventory from a stock Renesis.
- Engine-bound parts, engine condition and saved calibration remain attached when an engine is removed.
- Moving that engine into another compatible chassis restores the engine build automatically.
- Parts that require a later Build Type remain physically attached to the stored engine but stay dormant until that chassis is capable of using them.
- Tires, suspension and weight-reduction hardware remain chassis-side.
- The normal Parts inventory hides components currently attached to a stored engine assembly.
- Existing V0.5H saves are migrated forward and, where the previous swap record is unambiguous, loose engine parts are re-associated with their stored engine.
- Shop listing eligibility is data-driven from Engine Creator completeness + Swap Shop visibility. **Chassis fitment remains explicitly authored** so creating an engine does not automatically claim it physically fits every car.

### V0.5H Engine Swap Shop

- **ENGINE SWAP SHOP** is a dedicated Main Menu location rather than another Parts category.
- Front-Half Race Cars can use authored custom engine swaps; particularly extreme chassis/engine combinations can be reserved for Full Race Cars.
- The shop only lists engines with complete authored output data and curves. Fitment-only placeholders do not enter gameplay until their Engine Creator definitions are finished.
- Each chassis explicitly defines which engines fit, the minimum Build Type, fitment severity and installation labor.
- Buying an engine and installing it are separate cost concepts. Once an engine is owned, swapping it again only charges installation labor.
- Removed engines stay in **Engine Inventory**, including their failed/healthy condition, so the original engine is never destroyed by a swap.
- Engine-bound build parts are automatically uninstalled and retained in normal Inventory. Chassis hardware such as tires, suspension and weight reduction remains where appropriate.
- The installed Engine ID drives Parts compatibility. After a swap, opening Parts immediately shows choices for the new engine instead of the factory engine.
- Swap confirmation previews stock output, PI and a current-vs-replacement dyno before committing.
- Engine Creator now includes Swap Shop listing visibility and purchase price authoring.
- Gearing is not part of V0.5H; the intended later direction is realistic final-drive choices rather than arbitrary per-gear sliders.

### V0.5G.2 tuning polish + real risk

- **BASE MAP** replaces Safe Baseline. It calculates a conservative, all-green starting map for that specific owned car without revealing the fastest calibration.
- Engine limit status is isolated from chassis tuning: changing tire PSI can change grip, but cannot change whether the engine is HEADROOM / NEAR LIMIT / ENGINE-LIMITED.
- The tuning laptop now uses the freed monitor space for a live before/after HP + torque dyno graph.
- Risk now has a real consequence. Aggressive boost/fuel/timing and running near the engine envelope increase a displayed per-pass catastrophic-failure chance.
- A catastrophic failure causes a DNF, persists the car as **ENGINE FAILED**, blocks more racing, and requires a paid engine rebuild in Garage.
- Low-risk / BASE MAP calibrations have zero catastrophic-failure chance; pushing the edge is optional risk/reward rather than unavoidable RNG.

### V0.5G.1 engine-specific power envelopes

- Horsepower is no longer allowed to grow exponentially just because many supporting parts are installed.
- **Support hardware** (fuel system, Engine Kits, structural internals, standalone ECU hardware) primarily enables power instead of directly creating large percentage gains.
- **Power-making hardware** (boost, major airflow work, intake/exhaust, porting/cams where applicable) still changes output directly.
- Every engine carries a soft Stock / Engine Kit 1 / 2 / 3 / 4 horsepower envelope. Output begins seeing diminishing returns before the limit rather than hitting an artificial hard wall.
- The current Renesis max-effort envelope is about **1100 crank hp**. Getting meaningfully beyond that should require an engine swap rather than another stack of multipliers.
- Larger engines scale higher through authored or displacement/configuration-derived envelopes, preserving the future value of engine swaps.
- Garage Tuning now shows **Engine Envelope** and **Raw Request**, making it clear when additional boost is mostly running into the engine rather than generating useful power.
- Saved cars are migrated/recalculated automatically when this model lands.

### V0.5G garage tuning

- Installing **Standalone ECU + Laptop** unlocks a per-car **TUNING** action in Garage.
- The calibration workspace includes Boost Target, six-gear Boost-by-Gear, Fuel Trim, Ignition Advance, Launch RPM, Shift RPM and Front/Rear Tire PSI.
- These settings feed the actual race simulator: power settings change HP/TQ, tire pressure changes usable grip, early-gear boost changes traction demand, and launch/shift strategy changes ET.
- Higher-risk calibrations can intermittently trigger an ECU power pull, so the biggest dyno number is not automatically the quickest or most repeatable setup.
- Each owned car gets a small deterministic calibration fingerprint. A tune shared by another player can be close, but its exact fuel/timing/tire sweet spot will not be identical on every car.
- The laptop gives directional diagnostics rather than exposing hidden ideal numbers; post-race data logs show whether boost strategy, wheel slip and stability actually affected the pass.
- Tire PSI is stored with the laptop calibration for convenience even though it is physically a chassis adjustment.

### V0.5F deep Stage 3 / Stage 4 parts

- Front-Half and Full Race Cars now unlock substantial supporting-part depth rather than growing almost exclusively through Forced Induction.
- Parts modals use **subcategories** and show at most **three parts per page**, keeping large catalogs usable without turning the modal into a long scrolling list.
- Stage 3 expands Intake, Exhaust, Fuel, ECU, Drivetrain, Suspension, Tires and Weight Reduction.
- Stage 4 adds more extreme versions of those systems plus a dedicated **Engine** category.
- Piston engines can access pistons, rods, block, valves, valve springs, cams, cam gears and head work. Rotary engines receive purpose-built rotary choices such as race seals, bridge-port housings, lightweight rotors and an eccentric shaft.
- Standalone ECU + laptop hardware is now represented in the catalog; the actual home-garage tuning interface is intentionally reserved for the next tuning-system pass.
- A strong RWD Stage 4 RX-8 can now reach the low-8-second 1/4-mile neighborhood without requiring twin charging or a 300-shot NOS setup.
- Engine swaps remain the next powertrain-system feature. Stage 3/4 no longer falsely claim that the current UI already implements them.

### V0.5E Parts Creator MVP

- Content Studio now exposes **Parts Creator** beside Car Creator and Engine Creator.
- Existing catalog parts can be loaded, edited or cloned; new definitions can be saved as browser-local drafts or activated locally for testing.
- Performance-part compatibility can target exact Engine IDs first, then optionally narrow by car, Build Type, aspiration, engine configuration and engine tags.
- Parts can author HP, torque, weight and grip effects using add/multiply operations, with a live test-car before/after PI preview.
- Requirements/conflicts support part IDs and tags for build-puzzle relationships.
- Lifecycle supports Draft, Active, Scheduled, Deprecated and Retired states plus replacement-part references.
- Deprecated/retired/draft parts are removed from normal new purchases while existing owned inventory remains valid.
- Local and server gameplay now validate authored compatibility and build-rule metadata rather than treating it as documentation only.

### V0.5D.1 parts depth + UX

- Stage 1 **Buy + Install** now keeps the active category modal open so the next step can be purchased without reopening the category.
- Street Race Car+ uses a 3-column category layout; the new **Engine Kit** category creates a 3x3 desktop parts grid instead of growing into a long page.
- Added four progressive Engine Kits: forged street bottom end, built bottom end, race block/head, and a 50,000 CR max-effort race engine.
- Higher forced-induction upgrades now require appropriate Engine Kit levels. This starts the durability/build-puzzle layer instead of allowing every boost/NOS part on a stock long block.
- Forced Induction system cards now explicitly say **CLICK TO OPEN**, show only the current/next progressive upgrade where appropriate, and use a wider non-scroll desktop layout.
- Forced Induction part pages now include a selectable **before/after dyno preview** based on the authored engine curve (or a generated fallback curve).
- Earlier Stage 2/3 parts remain purchasable after advancing Build Type; Forced Induction and Engine Kits are optional build paths rather than progression locks.
- The Admin development account is normalized to a **10,000,000 CR minimum balance** for testing.
- Engine snapshots now retain curve profile/notes/curve points so new cars can carry their Engine Creator dyno data into future parts/tuning systems.

### V0.5D forced-induction foundation

- Added a dedicated **Forced Induction** Parts category for Street Race Car and later builds.
- Stage 2 supports Turbo Kit, Supercharger Kit and a 50-shot NOS kit. Factory turbo/supercharged cars treat their factory system as already installed.
- Stage 2 turbo/supercharger systems get three progressive kit upgrades. Switching primary kits asks for confirmation and uninstalls the old system's parts without deleting them.
- Stage 3 unlocks individual turbo hardware (intercooler, turbo, BOV, piping), supercharger hardware (head unit, pulley), and 75 / 100 / 150-shot NOS progression.
- Stage 4 unlocks **twin charging** plus 175 / 200 / 250 / 300-shot NOS.
- Added Stage 2 → 3 and Stage 3 → 4 conversion flow; Stage 2 requires one installed choice in every core category while Forced Induction remains optional.
- Car Creator now has **REFRESH ENGINES** so a newly activated Engine Creator definition can appear without reloading the whole site.

### V0.5C.3 composite/trophy art fallback

- Cars that only have certified/atlas composite artwork now stay visible during race playback instead of disappearing when animated wheels are requested.
- Race animation automatically falls back to static certified art when separate body/wheel layer sources are unavailable.
- Car Creator now detects non-paintable composite artwork and shows **PAINT LOCKED** / fixed-livery status rather than presenting paint controls that cannot work.
- These cars remain fully usable in garage, Classifieds, Parts, and races; layered body/wheel PNGs can be added later if paint and spinning wheels are desired.
- This specifically covers imported/special cars like the HD Golf test without forcing us to fake a paint mask over windows/wheels/details.

### V0.5C.2 factory boost baseline

- Turbo, twin-turbo, turbo-diesel and supercharged engines now expose an optional **Factory Peak Boost (PSI)** field.
- Peak boost is baseline/reference data only. It does **not** calculate horsepower or torque automatically.
- HP/TQ anchors and the authored dyno curve remain the source of performance; boost exists so future turbos, superchargers, boost controllers and tuning can build from the factory baseline.
- Car Creator shows the linked engine's factory boost when applicable.

### V0.5C.1 Engine Creator simplification

- Removed Compression Ratio, Engine Weight, Size Class and Orientation from the Engine Creator workflow.
- Engine swap fitment direction is now deliberately simple: displacement allowance first, with explicit compatibility exceptions later.
- Replaced **Curve Evidence** with selectable **Curve Profiles** that shape generated baselines: Small / Economy, Turbo Street, Muscle / Big V8, JDM VTEC / Cam Change, High-Rev NA, Motorbike, Diesel, Rotary and Broad Performance.
- Curve Profile affects **Generate From Profile** only; the authored torque points remain fully editable afterward.
- Existing engine data was migrated to a profile while keeping the same peak anchors and authored curves.

### V0.5C Engine Creator

- Added a dedicated **Engine Creator** inside Content Studio, modeled after the familiar Auto Dyno Curve workflow without requiring ChatGPT inside the game tool.
- Engines now have **family + variant IDs**, manufacturer/name metadata, displacement, configuration, aspiration, tags, peak HP/TQ anchors, redline and rev limiter.
- Power curves are **torque-first**: RPM + torque are authored directly and horsepower is always derived with HP = Torque × RPM / 5252.
- Engine Creator includes a live HP/TQ graph, editable curve table, validation, and a quick **Generate Baseline** option for rough game curves before source-backed refinement.
- Local engine drafts can be saved, activated, exported or copied just like cars.
- Car Creator now has a **Factory Engine** selector. Linked engine specs come from Engine Creator while chassis weight, grip, drivetrain and engine location remain car-specific.
- The three current playable cars are now linked to dedicated engine variants and the older swap-fitment engine catalog has been migrated into the new schema for future completion.
- Parts Tool remains **NEXT**, now with the engine IDs/families it needs for engine-specific compatibility from day one.

### V0.5B release system + Parts Creator foundation

- Car Creator now has a per-car **Release** section with **Draft**, **Release Immediately**, and **Schedule Release** modes.
- Scheduled cars remain hidden from Classifieds, Showroom, and random opponents until their release timestamp; the Classifieds cache expires at the next scheduled release so the car becomes eligible without waiting for the normal market refresh.
- Existing catalog cars remain backward-compatible and are treated as already released unless release metadata is explicitly authored.
- Factory paint swatches are now clickable preview selectors: clicking an existing color immediately repaints the Car Creator preview, while the native color picker still edits that swatch.
- Added a reusable content-release lifecycle intended for cars now and later for parts, wheels, wraps, and limited/collector content.
- Added **design/PARTS_CREATOR.md** defining engine-first compatibility, per-build-stage choices, requirements/conflicts, event-rule tags, generated baseline parts, custom parts, and deprecation/replacement behavior.
- Parts Tool is now marked **NEXT** in Content Studio.

### V0.5A.3 coordinate polish

- Removed the extra Rear / Front anchor legend from the live car preview; the actual wheel-center dots remain.
- Layer-table X/Y columns are now explicitly **X OFFSET / Y OFFSET** so they are not confused with the car's real wheel-center coordinates.
- Wheel and disk rows now display their actual default rear/front center coordinates from the vehicle art metadata.
- Body/detail layer X/Y remain source-canvas offsets.

### V0.5A.2 Content Studio polish

- Wheel anchor dots now account for certified image fitting and atlas cell offsets instead of always using raw source-canvas percentages.
- Added a five-color factory paint palette to Car Creator. Selecting a swatch previews that color through the body paint layer when layered artwork is available.
- Classifieds listings now receive a paint color from the authored palette; purchased cars retain that color, and race opponents can vary through the same palette.
- Added starter palettes to the three currently playable cars.
- Local authoring now distinguishes **Save Draft Locally** from **Activate Locally + Reload**. Draft cars stay out of gameplay; activation merges the car into the browser-local catalog and invalidates the current used-lot cache.
- Classifieds and Showroom controls remain separate but now explain their exact market behavior in the editor.

### V0.5A.1 Content Studio preview hotfix

- Existing playable cars now open in Content Studio using their certified production artwork instead of immediately forcing raw editable layers.
- Art-roster-only cars now correctly fall back to the certified atlas until PNG layers are actually available.
- Editable mode for the three current playable cars uses the known-good race PNG layer sources while preserving Content Studio X/Y/Z transforms.
- Paint or layer edits switch into editable-layer preview mode; untouched cars stay visually identical to normal gameplay.
- Added an explicit Forever Racing favicon to remove the browser's missing-favicon request.

### V0.5A Content Studio / Car Creator

- Added a developer-only **Content Studio** route with **Car Creator** as the first authoring module.
- Car Creator can start a new car, load any existing gameplay car, or use any of the 57 purchased art-roster entries as a starting point.
- Factory engine and physics inputs feed the same deterministic 51-pass Performance Index benchmark as gameplay, so PI and D/C/B/A/S/X class update live while authoring.
- PNG body / wheel / disk / detail layers can be uploaded in-browser. Canvas size, wheel anchors, bumper anchors, ground line, per-layer X/Y offsets and Z stacking are editable.
- Layer 1 body paint can be previewed with a color mask while detail/wheel layers remain separate.
- Saved cars become browser-local catalog overrides after reload, allowing GitHub Pages playtesting without modifying repository JSON.
- Completed car definitions can be copied or exported as JSON for permanent repository integration.
- Parts Tool and Wheels Tool are visible as the next planned Content Studio modules.

### V0.4H.4 physics-linked race motion

- Race movement now derives its acceleration curve from each pass's actual elapsed time and trap speed instead of one fixed visual easing curve.
- Wheel rotation integrates the same physical distance traveled, so wheel speed rises and falls with the car rather than being a separate animation.
- Driven-wheel launch slip remains traction-aware, but is now applied as extra wheel-speed ratio on top of road speed.
- Post-finish fly-through continues at the measured trap speed rather than jumping to a fixed 22% extra track distance.

### V0.4H.3 race lane centering

- Side-view race cars are vertically centered inside their own 50% lane instead of using asymmetric top/bottom offsets.
- This fixes shorter sprites such as the RX-8 appearing too low in the lower lane while preserving staging, finish timing and fly-through behavior.

### V0.4H.2 race animation pass

- The original CSS drag tree is back; the purchased tree sprite is no longer used for active race playback.
- The road texture is vertically aligned so its native white stripe sits at the track midpoint, and both cars ride the darker rubbered-in grooves.
- Quick Race uses race-only layered PNGs for the three playable cars so tire/rim layers can animate independently while the certified composites remain unchanged elsewhere.
- Wheel rotation follows track travel. Calculated launch slip adds extra rotation only to the driven axle.
- Both JS and PHP race simulation now expose deterministic traction telemetry: grip loss, wheel slip and smoke level.
- Tire smoke uses the purchased smoke sprite and appears only when calculated launch grip loss is high enough; FWD uses the front tire, RWD the rear tire, AWD both.
- Performance classes now extend through **X Class**: D < 450, C < 600, B < 750, A < 900, S < 1100, X >= 1100.

### V0.4H.0 race visual pass

- Quick Race now uses the purchased road texture instead of the placeholder grid strip.
- Purchased track-rail, start/finish and Christmas-tree artwork are used during race playback.
- Each car gets a purchased under-car shadow that travels with it.
- Existing race geometry is unchanged: front wheel stages the car, front bumper stops timing, then the car visually flies through the traps.
- Wheel rotation and smoke from grip loss are intentionally the next race-animation passes.

### V0.4G roster art and performance classes

- All **57 purchased cars** now have runtime-ready PNG artwork packed into five transparent atlas pages.
- The three current starters keep direct certified PNGs and received another wheel-position correction: the total wheel drop is now **10px** from the detected wheel-opening center.
- Settings -> **Car Art Debug** now shows the entire 57-car roster and labels each entry **PLAYABLE** or **ART READY**.
- Artwork availability and gameplay availability are separate. The current gameplay catalog remains Golf GTI Mk6, RX-8 and Clio V6 Sport until additional vehicle specs are researched/approved.
- Performance Index maps into temporary letter classes: **D < 450, C < 600, B < 750, A < 900, S < 1100, X >= 1100**.
- All three current starter cars are **D Class**. An owned car's performance class updates when its PI changes.

### V0.4F.1 visual hotfix

- The Golf GTI, RX-8 and Clio V6 now use certified composite PNGs in normal gameplay so the starter visuals cannot be broken by layer conversion/import issues.
- The original body / wheel / rim / detail metadata is still retained for the future customization pipeline.
- Settings includes **Car Art Debug** to inspect the exact three starter visuals used by gameplay.
- Parts now defaults to **BUY + INSTALL** instead of forcing a trip back to Garage after every purchase.
- The visible onboarding flow is five actions rather than six because first-part purchase and installation are now one action.

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

### V0.4F visual reset, racing and Performance Index

V0.4F makes the purchased layered side-profile pack the vehicle-art source of truth for the current catalog.

The first playable catalog contains only three cars whose visuals and gameplay data are both validated:

- **Volkswagen Golf GTI Mk6** — 2.0L turbo I4, 200 hp, 207 lb-ft, FWD, 3,034 lb.
- **Mazda RX-8** — 1.3L naturally aspirated rotary, 238 hp, 159 lb-ft, RWD, 3,029 lb.
- **Renault Clio V6 Sport** — 2.9L naturally aspirated rear-engine V6, 255 hp, 221 lb-ft, RWD, 3,086 lb.

The purchased pack contains 57 complete four-layer vehicle sets. `data/catalog/car-art.json` keeps their source inventory, geometry and runtime PNG-atlas mapping, while `data/catalog/cars.json` contains only gameplay-enabled cars. All 57 visuals are runtime-ready; cars enter the market only after their gameplay data is researched and approved.

Each layered car uses:

1. wheel/tire/brake layer, duplicated front and rear;
2. rim/disk layer, duplicated front and rear;
3. paintable body layer;
4. non-paintable detail/window/body-line layer.

Metadata stores one native coordinate system per car: rear/front wheel centers, ground line, front/rear bumper anchors and native canvas size. Every game screen scales from those same coordinates. The separated rim layer is intentional groundwork for a future visual wheel/rim shop.

The race presentation is now **side-view and horizontal**. The front tire is staged on the start plane; elapsed timing stops when the **front-bumper anchor** reaches the finish timing plane. The sprite then continues past the finish visually without changing the recorded ET.

### Performance Index

V0.4F introduces a temporary numerical performance language before final class boundaries are designed.

A hidden benchmark runs the car down a standardized 1/4 mile 51 times with deterministic simulation, no animation, no foul and neutral weather. The median ET becomes PI using:

`PI = max(0, round((20.000 - quarterMileET) * 80))`

That is exactly **8 PI per 0.1 second** of standardized quarter-mile performance.

PI is used for current matchup/Circuit difficulty and is safe to show to players. V0.4G also derives D/C/B/A/S class letters from PI. Opponent Race Preview intentionally does **not** expose exact HP, torque or weight; it shows class, PI, drivetrain and build type instead. This preserves uncertainty while keeping matchup strength understandable.

The current simulator is still an intermediate model. Engine RPM/redline/curve and deeper drivetrain behavior can be incorporated into later benchmark revisions without changing the PI-facing UI contract.

### Vehicle art pipeline

`assets/js/ui/vehicleRenderer.js` composites the layered side-profile definition for every current vehicle surface. A car without a complete enabled layer set shows the explicit `ART MISSING` fallback rather than a fabricated vehicle.

Runtime art uses five PNG atlas pages under `assets/art/cars/atlas/`, with direct certified PNGs retained for the three current starters. The source-name mapping and original layer geometry remain in `data/catalog/car-art.json` so every runtime car stays traceable to the purchased pack.

The old generated side-profile/top-down sprite system is historical and no longer drives the current playable catalog. Side-view racing deliberately matches the purchased asset pack instead of inventing unavailable top-down art.

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
