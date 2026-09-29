# Parts Creator / Parts System Direction

Parts Creator is the next Content Studio module after Car Creator. Its job is not just to add more rows to parts.json; it needs to make each engine and build path feel different.

## Product goals

- Avoid one universal best-in-slot parts ladder.
- Make engines respond differently to the same category of modification.
- Let a build become a puzzle: power, torque, weight, grip, forced induction choice, build stage, PI target and event rules all compete.
- Keep the system expandable. New real-world-style parts, replacement models, limited/event parts and collector items should be addable without gameplay-code changes.
- Let generated baseline parts get the first cars playable quickly, while hand-authored custom parts become the interesting long-term content.

## Compatibility should be engine-first

The current catalog is largely global. Parts Creator should move toward explicit compatibility.

Recommended compatibility block:

```json
{
  "compatibility": {
    "engineIds": ["fiat_multiair_14t"],
    "carCatalogIds": [],
    "excludeCarCatalogIds": [],
    "buildStages": [2, 3, 4],
    "aspiration": ["Turbo"],
    "engineConfigurations": ["I4"],
    "tagsRequired": [],
    "tagsBlocked": []
  }
}
```

Rules:

1. Engine ID is the primary performance-part relationship.
2. Car-specific parts can narrow compatibility further.
3. Generic chassis categories such as tires, suspension and weight reduction can use car/chassis compatibility instead of engine compatibility.
4. Stage 3/4 engine swaps carry the installed engine ID with them, so the parts list follows the engine rather than magically following the original car.
5. Compatibility should support explicit exclusions because oddball cars/engines will need exceptions.

## Build stages

### Stage 1 — Street Car

Keep the simple three-level upgrade ladder for onboarding, but eventually generate its numbers from an engine/car profile rather than one universal set of gains.

A 200 hp turbo four-cylinder should not gain the same percentage or shape as a 200 hp naturally aspirated rotary.

### Stage 2 — Street Race Car

Named parts become real choices instead of Level 1/2/3.

Example intake choices might trade:

- peak horsepower
- torque
- weight
- powerband / peak RPM later
- cost
- compatibility with another part
- PI efficiency

There should not always be one mathematically superior choice.

### Stage 3 — Front-Half Race Car

This is where engine-specific catalogs should expand heavily.

Examples:

- multiple turbo frame sizes
- supercharger systems
- engine internals
- cylinder head / valvetrain
- intake manifolds
- fuel systems
- transmission / final drive choices
- race suspension
- nitrous systems
- engine swaps

### Stage 4 — Full Race Car

Maximum freedom, but still not a flat "buy every strongest item" ladder.

Stage 4 should support extreme tradeoffs and specialized combinations, including parts that are only strong in a narrow PI/event target.

## Categories and tags

Parts should have both a category and descriptive gameplay tags.

Example:

```json
{
  "categoryKey": "forced_induction",
  "slot": "forced_induction",
  "tags": ["turbo", "large_frame", "drag", "high_rpm"]
}
```

Important tags include:

- turbo
- supercharger
- nitrous
- naturally_aspirated
- drag
- street
- high_rpm
- torque
- lightweight
- traction
- diesel
- rotary

The Circuit can use the same tags for event rules later:

- Turbo only
- Supercharger only
- NOS required
- specific manufacturer
- specific car brand
- class limit
- PI ceiling / PI window
- part category required
- stock-engine only
- engine-family restrictions

This keeps event design data-driven.

## Effects

The current engine supports hp, torque, weight and grip. Parts Creator should preserve those now while allowing the schema to grow.

Current-compatible effect:

```json
{
  "stat": "hp",
  "op": "add",
  "value": 18
}
```

Future effect targets may include:

- redline RPM
- rev cut RPM
- peak HP RPM
- peak torque RPM
- boost
- launch grip
- aero/drag
- gearing
- shift time

Do not fake unsupported physics values into the live catalog before the simulator understands them. Parts Creator can visibly mark those fields as future-capability fields.

## Requirements, conflicts and combinations

Parts should be able to create build puzzles.

Example:

```json
{
  "requires": {
    "allTags": ["turbo"],
    "anyPartIds": ["fuel_1000cc", "fuel_1300cc"]
  },
  "conflicts": {
    "tags": ["supercharger"],
    "partIds": []
  }
}
```

Eventually support:

- requires another category
- requires minimum stage
- requires specific engine
- requires a turbo/supercharger/nitrous tag
- mutually exclusive parts
- mutually exclusive induction systems
- supporting-part requirements
- optional synergies / set bonuses if we decide they add fun rather than hidden complexity

## Generated baseline + custom parts

For the first batch of cars/engines:

1. Generate a sensible baseline catalog per engine/category.
2. Give each category several usable choices at Stage 2+.
3. Add 1–2 hand-authored custom parts per category over time.
4. Custom parts are allowed to be better in one dimension and worse in another.
5. Avoid permanent linear power creep where each new item simply replaces the old item numerically.

The goal is for a player to ask "what works for this build and this PI target?" instead of "what is the newest part?"

## Part lifecycle / deprecation

Parts need a lifecycle independent of whether existing players own them.

Recommended lifecycle:

```json
{
  "lifecycle": {
    "status": "active",
    "availableFrom": null,
    "deprecatedAt": null,
    "replacementPartId": null,
    "retireFromStore": false
  }
}
```

Statuses:

- **draft** — authoring only.
- **scheduled** — prepared but not available until date/time.
- **active** — purchasable normally.
- **deprecated** — no longer normal current-stock; existing copies remain valid and it may still appear through collector/used/event channels.
- **retired** — not newly obtainable unless explicitly reissued.

Deprecation must never silently delete owned parts.

A replacement model can point back to the old part. Old parts may become desirable because they have different stats, rarity, visuals or historical value rather than simply being worse.

The generic Content Release system created for cars should eventually be shared by parts, wheels and wraps.

## Rarity / special content

Future metadata can include:

- manufacturer / fictional brand
- rarity
- event source
- trophy status
- limited quantity
- release batch
- collector value
- trade eligibility

Wheels need the same lifecycle so trophy/event wheels can genuinely become old or rare.

## Wrap layer

Cars should eventually support an additional visual wrap layer above paint/body and below whatever detail layers need to remain untouched.

The wrap definition should be cosmetic content, not baked permanently into the base car.

Likely visual order:

1. body base
2. paint mask
3. wrap layer
4. body/detail overlays
5. wheels/disks and other foreground pieces as appropriate

Wraps can later use the same release/deprecation/rarity infrastructure as wheels.

## Parts Creator UI — first working pass

The first usable Parts Creator should include:

- create / edit part
- choose build stage
- choose category + slot
- choose compatible engine(s)
- optional car include/exclude
- price
- description
- tags
- HP / torque / weight / grip effects
- add or multiply operation
- requirements / conflicts
- lifecycle: Draft / Release Now / Schedule / Deprecated / Retired
- replacement-part link
- live compatibility summary
- live before/after stats + PI on a selected test car/engine
- save local draft
- activate locally for testing
- export JSON

## Later Parts Creator passes

- baseline part generator by engine
- bulk clone/edit
- compare multiple parts side-by-side
- Stage 3/4 powerband/boost fields as the simulator gains support
- rarity + event acquisition
- part art/icon uploads
- deprecated/collector store behavior
- wheel creator integration
- wrap creator integration
- Circuit rule preview: "Would this build be legal for Event X?"

## Key principle

The part catalog should be content data, not hardcoded balance logic.

If adding a turbo, ECU, special wheel, old discontinued part or event-only nitrous kit requires changing gameplay code, Parts Creator has not gone far enough.
