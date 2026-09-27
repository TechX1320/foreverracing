# Changelog

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
