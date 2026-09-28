# TextTuned -> Forever Racing Migration Map

Source reviewed: `TechX1320/TextTuned-Server` (`master`, project snapshot added 2025-07-21).

Forever Racing's product goal is now explicit: rebuild the TextTuned Discord MMORPG as a browser-based racing MMORPG, while keeping intentional Forever Racing redesigns instead of blindly copying old code.

## Principles

- Preserve the *gameplay idea* of TextTuned, not the Discord command UI.
- V1 racing may remain fully math-automated. Player-input racing can be layered on later.
- Static GitHub Pages mode may simulate systems locally; true shared economy/PvP waits for server/database mode.
- Existing Forever Racing Build Stages, FTUE, storage abstraction and responsive browser UI are intentional changes and remain canonical.
- New systems must work through the shared storage/game-service abstraction rather than duplicating frontend logic.

## Feature inventory

| TextTuned system | Source behavior found | Forever Racing direction |
| --- | --- | --- |
| Player profile / progression | Credits, EXP, level, created/last seen, selected car, race/job stats | Port. Add true EXP/level progression beside current REP; profile becomes a browser screen. |
| Garage capacity | `2 + 1.98 * level`, capped at 200 | Port concept. Balance can change, but garage capacity should be progression-driven. |
| Garage | Selected car, HP/TQ/weight, engine/displacement, rarity, value | Already partially present. Expand toward TextTuned's richer vehicle record. |
| Dealership | 9 random stock cars, global refresh ~1h, user forced refresh cooldown ~2h | Port. Current full catalog is useful for dev; production dealer should become rotating inventory. |
| Buying cars | Credit check, garage capacity, EXP reward on purchase | Port with economy rebalance. |
| Rarity | Common, Uncommon, Rare, Super Rare, Ultra Rare, Secret Rare; price multipliers | Port concept. Keep separate from performance class. |
| Parts shop | Category browsing, buy/install/uninstall, inventory, replacement preview | Already substantially redesigned. Preserve Forever Racing Build Stage system, but port missing shop/inventory depth. |
| Old stage kits | Sequential Stage 1-3 generic HP/TQ/weight kits | **Superseded** by Forever Racing's four Build Stages and per-category progression. Do not restore literally. |
| Instant races | Automated 1/4, 1/2, 1 mile; RT, ET, trap speed, EXP, records | High-priority port. Replace current simplified Quick Race math with a browser-friendly TextTuned-derived race engine. |
| Race variability | Launch consistency, shift penalty/skill, engine variability, weather | Port and clean up. This is part of TextTuned's identity. |
| Weather | Weighted normal, severe and rare/nightmare conditions with ET/MPH modifiers | Port. Excellent event/flavor system. |
| Locations | Weighted world locations plus rare/nightmare locations | Port. Browser UI can give each race context without needing art immediately. |
| Best ET records | Per-car 1/4, 1/2 and 1-mile best ET | Port. Foundation for leaderboards. |
| Race cooldown | Per-player race cooldown | Port where useful; tune for browser pacing. |
| Async PvP / TruePVP | Challenge, accept/decline, 24h expiry, car snapshots | Port in server mode. Natural browser challenge inbox. |
| PvP wagers | 0-10k credit bets; pink slips gated to Level 10+ | Port later with transaction safety and anti-dupe controls. |
| PvP matchmaking safety | Rejects severely mismatched cars; caps pending challenges | Port concept, refine around class/performance rating. |
| Used Car Lot | Player listings, player-to-player purchase, cancellation, random 9 listing feed, daily refresh | Port. Current NPC Used Lot can remain a local-dev simulation; server mode should become a real player market. |
| Rentals | Rent non-selected/non-listed cars, duration limits, max concurrent rentals, passive payout | Port after economy/player market. |
| Odd Jobs | Random job feed, cooldown, level-gated job tiers, payouts, EXP, hours worked | Port. Strong non-racing money/EXP loop. |
| Job tiers | Large pool at roughly Level 10/20/30/50 tiers | Port content, rebalance payouts/time for browser use. |
| Achievements | Job-count and hours-worked milestones plus rewards | Port and expand to racing/build/collection achievements. |
| Endless Racer | Persistent escalating PvE rounds, random race distance, bots, run state | Merge with current RogueLike prototype rather than keeping two overlapping modes. |
| Endless effects | Choose temporary HP/TQ/weight, bot debuffs, NOS, reaction-time effects | Port into the merged Endless Racer/RogueLike mode. |
| Endless leaderboard | Monthly best-round records | Port. |
| Leaderboards | Best ET by 1/4, 1/2, 1 mile; car-name filtering | Port. Expand to class/model/build-stage filters. |
| Admin tools | Create user/car, give car, list stock, refresh boards, sync achievements, server status | Rebuild later as a web admin/dev panel rather than commands. |

## Preserved TextTuned details worth reusing

### Progression

TextTuned derives level from total EXP using:

`floor(100 * level^1.75)` as the threshold function.

Garage capacity grows with level and caps at 200 slots.

These formulas should be treated as starting balance references, not untouchable constants.

### Odd Jobs

The surviving source contains a large job pool themed around the car world: delivery work, quick-lube work, junkyard runs, detailing, dyno assistance, track setup, tuning, fabrication, logistics and more. It is enough content to seed a browser Jobs screen rather than inventing the system from scratch.

### Achievements

Surviving job milestones include:

- Jobs completed: 10, 50, 150, 325, 700.
- Hours worked: 5, 20, 75, 150, 300.
- Separate `Odd Job Master` at 100 completed jobs.

### Endless Racer effects

Examples in source:

- +3% player horsepower
- -3% player weight
- +3% player torque
- -5% bot horsepower
- +5% bot weight
- -5% bot torque
- NOS boost
- bot reaction-time delay
- rare big NOS shot

This maps cleanly to the temporary-upgrade choice system already prototyped in Forever Racing's RogueLike mode.

## Intentional Forever Racing changes

Do **not** undo these when porting:

- Current FTUE and browser-first navigation.
- Current starter-car philosophy/roster unless deliberately rebalanced later.
- Four Build Stages:
  1. Street / Stock Chassis
  2. Street Race
  3. Front-Half / Tube Chassis
  4. Full Race Car
- Per-category Stage 1 progression and choice-based Stage 2 parts.
- Physical engine-swap compatibility groundwork.
- Static development mode + server provider abstraction.
- Explicit authored vehicle artwork with missing-art placeholders.

## Proposed implementation order

### V0.3 — TextTuned race core

1. Replace simplified Quick Race formula with a cleaned-up TextTuned-derived simulation.
2. Support 1/4, 1/2 and 1-mile races.
3. Add reaction time, ET, trap speed and package.
4. Add weather and location pools.
5. Record per-car best ETs.
6. Add EXP/level progression and race EXP.
7. Add race history/result detail UI.
8. Keep races automated; design the simulation API so future player input can supply reaction/shift decisions.

### V0.3B implementation status

The first race-core migration is now implemented:

- cleaned-up TextTuned-derived automated simulation;
- 1/4, 1/2 and 1-mile distances;
- RT / red lights / ET / trap / total time;
- weighted weather and locations, including rare nightmare entries;
- per-car pass counts, best ET and best trap;
- EXP rewards and TextTuned-style level curve;
- race-history/result UI;
- shared browser-local and PHP/server behavior.

Player-input racing remains a later layer on the same simulation/result contract rather than a replacement.

### V0.4A — Race presentation layer

The race math remains automated, but results are no longer presented instantly.

Implemented direction:

- race start and race finish are separate state transitions;
- one persistent active race prevents button-spam / duplicate-pass generation;
- top-down cars animate down a two-lane strip over the simulated elapsed time;
- pre-stage, stage, tree, race clock and progress bars make the pass readable;
- rewards, EXP, records and history are committed only after the finish timestamp;
- refresh/reload resumes the same active pass;
- navigation remains locked to the race until the pass finishes;
- final timing slip appears after the visual race rather than before it.

This is also the persistence foundation for later interactive launch/shift/NOS racing and server PvP/wagers.

### V0.4 — Economy / daily loop

1. Rotating dealership stock.
2. Garage capacity by progression.
3. Odd Jobs.
4. Rarity/value system.
5. Achievements.
6. Player profile/stat screen.

### V0.5 — Endless Racer

1. Merge current RogueLike prototype into TextTuned-style Endless Racer.
2. Persistent rounds and escalating bot tiers.
3. Temporary effect choices.
4. Auto-run/pause behavior.
5. Endless leaderboard.

### V0.6 — Server economy / social competition

1. Real player Used Car Lot.
2. Rentals.
3. Async PvP challenge inbox.
4. Cash wagers.
5. Pink slips after transaction/anti-dupe protections.
6. Global leaderboards.

Teams/events can continue alongside this roadmap once their core dependencies exist.

## Player-input racing later

Automated math racing should be the V1 foundation, not a dead end.

The race engine should eventually accept optional player inputs such as:

- reaction/launch timing
- shift timing
- throttle/traction decisions
- NOS activation
- lane/strategy choices where appropriate

When no input is supplied, AI/skill-derived values generate the same fields automatically. This lets automated TextTuned-style races and future interactive races share one simulation/result model.
