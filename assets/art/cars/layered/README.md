# Layered vehicle art

V0.4F resets Forever Racing's vehicle presentation around the purchased four-layer side-profile asset pack.

## Runtime layer contract

Each enabled car has one directory:

```
assets/art/cars/layered/<asset-id>/
  body.png
  wheel.png
  disk.png
  detail.png
```

The renderer duplicates the single wheel/tire and disk/rim assets at the front and rear wheel-center anchors stored in `data/catalog/car-art.json`.

Render order:

1. rear tire/brake layer
2. rear rim/disk layer
3. front tire/brake layer
4. front rim/disk layer
5. paintable body
6. optional paint mask
7. non-paint detail/windows/body-line layer

This makes future rim, tire, paint and stance customization data-driven instead of requiring a complete replacement vehicle PNG.

## Manifest policy

`data/catalog/car-art.json` indexes all 57 complete source sets from the supplied asset pack.

V0.4F intentionally checks only the validated gameplay cars into the runtime directories:

- `Golf_GTI`
- `Mazda_RX8`
- `Renault_Clio`

The other 54 stay `runtimeAvailable: false` until their gameplay/OEM data and auto-generated anchors are reviewed. The HD Golf file is cataloged but is not the active Golf GTI visual.

## Geometry

Coordinates are stored in native source pixels and scaled by the renderer:

- front/rear wheel center
- ground/baseline Y
- front bumper X
- rear bumper X

The auto-anchor pass deliberately drops wheel centers by about 10% of tire height from the transparent wheel-opening estimate. This exposes more tire/sidewall and avoids the overly slammed look from the first analysis preview.

The front-bumper X anchor is also the drag-strip timing point. ET/timing freezes when that anchor crosses the finish plane; the sprite may continue beyond the line for visual fly-through.
