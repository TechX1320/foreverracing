# Content Studio

Content Studio is Forever Racing's internal browser-based content authoring surface.

## V0.5A: Car Creator

The first module is Car Creator. It is intentionally built on the same vehicle schema, renderer, race simulator and Performance Index code used by the game so authored content can be previewed and benchmarked before it becomes permanent repository data.

### Supported now

- Create a new vehicle definition.
- Load and edit an existing gameplay vehicle.
- Load any entry from the purchased 57-car art roster as a starting point.
- Edit identity, price and market availability.
- Edit engine and physics inputs used by the current race simulator.
- Recalculate the deterministic 51-pass 1/4-mile benchmark, Performance Index and D/C/B/A/S/X class live.
- Upload PNG body, wheel, disk and detail layers in the browser.
- Edit canvas size, front/rear wheel anchors, bumper anchors and ground line.
- Edit X/Y offsets and Z stacking for each visual layer.
- Preview Layer 1 body paint with a color mask.
- Save the authored car as a browser-local catalog override.
- Reload and playtest the saved override in GitHub Pages/local mode.
- Export or copy the completed car JSON for permanent repository integration.

### Saving model

GitHub Pages cannot write directly back to the repository. V0.5A therefore keeps authored cars in a browser-local Content Studio overlay. LocalStorageProvider merges enabled Content Studio cars over data/catalog/cars.json at startup.

That makes iterative content testing possible without modifying production/server persistence. Permanent cars still move into repository JSON/art assets through a reviewed commit.

Uploaded PNGs are stored as data URLs inside the local authoring record for the current prototype. Permanent content should replace those data URLs with normal asset paths when committed.

## Planned modules

### Parts Tool

The Parts Tool will author performance parts and later support the named higher-build-type catalog used by Street Race Car, Front-Half Race Car and Full Race Car.

Planned fields include compatibility, slot/category, price, stat effects, stage/build-type restrictions, engine requirements and visual changes.

### Wheels Tool

The Wheels Tool will import wheel artwork, define visual fitment/anchors, author wheel-store pricing/rarity and support special trophy/event wheels.

The game-side wheel store should consume the same authored wheel definitions rather than maintain a separate hardcoded catalog.

## Direction

Content Studio should become the single source of authoring for cars, performance parts and cosmetic vehicle components. Game code should consume authored content; adding a normal car or part should not require editing gameplay code.
