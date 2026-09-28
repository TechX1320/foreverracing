# Forever Racing Vehicle Art Contract

Forever Racing should never pretend unfinished vehicle art is finished.

## Views

Vehicle metadata may define these authored views:

- `sideProfile` — preferred for Showroom, Garage, Parts and car-detail presentation.
- `topDown` — preferred for racing scenes and track placement.
- `showroom` — optional dedicated override; falls back to `sideProfile`, then `topDown`.
- `racePreview` — optional dedicated race/PvP override; falls back to `topDown`.
- Stage-specific variants may be supplied as `stage1`, `stage2`, `stage3`, `stage4` under a view.

Example:

```json
{
  "visual": {
    "sprites": {
      "sideProfile": {
        "src": "assets/art/cars/vehicles/example-side.png"
      },
      "topDown": {
        "src": "assets/art/cars/vehicles/example-top.png"
      }
    }
  }
}
```

## Missing art

If no authored asset exists—or an image fails to load—the UI must show the boxed `? / ART MISSING` marker. Do not substitute a generic car silhouette. This makes unfinished vehicles obvious during development.

## Current authored dual-view starters

- 1998 Honda Civic DX — side profile + top down
- 2003 Nissan 350Z — side profile + top down
- 2005 Ford Mustang GT — side profile + top down

## Other authored race art

- 2004 Subaru Impreza WRX STI — top down only

## Next art batch

The current catalog has eight cars still needing authored art:

1. 2002 Acura RSX
2. 2002 Chevrolet Camaro Z28
3. 1999 Mazda MX-5 Miata
4. 2013 Fiat 500 Abarth
5. 2013 Hyundai Veloster Turbo
6. 2018 Subaru Impreza 2.0i
7. 2016 Ford Shelby GT350
8. 2003 Acura NSX

Direction: create side-profile assets first for Showroom/Garage readability, then top-down race assets. Art work is a parallel track and should not block core MMORPG systems.


## Known quality issue — tire/rubber rendering

The current authored starter **side-profile** exports need another art pass around the wheels. In normal Garage/Parts sizing, the rims read as if they have little or no black tire rubber around them.

This is an authored-asset defect, not a CSS/UI problem. Do not fake tires with UI circles or overlays. Regenerate/retouch the source side-profile sprites so the tire sidewall is clearly visible at native pixel-art scale, then replace the affected PNG assets.

Priority:
1. 1998 Honda Civic DX
2. 2005 Ford Mustang GT
3. 2003 Nissan 350Z
