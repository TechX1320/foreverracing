# Forever Racing

Forever Racing is a browser-based drag-racing / garage-management game inspired by the earlier TextTuned Discord game.

## Current direction

The project is being rebuilt around:

- compact browser-game UI that works on phones, foldables, tablets, and desktop
- no guest accounts in the eventual hosted game
- showroom, garage, parts, used cars, events, teams, leaderboards, RogueLike and racing systems
- Build Stage 1-4 vehicle progression
- procedural/code-generated vehicle visuals as a prototype
- clean feature/domain separation in JavaScript and PHP
- JSON storage during prototyping, with a later SQL migration path

## Development hosting

GitHub Pages is intended to be used as a **static development/demo build** while the game has no real shared user data.

GitHub Pages cannot execute PHP or provide a writable server-side database. The development build should therefore use a browser-local data provider (for example localStorage/IndexedDB) behind the same frontend storage interface used by the PHP/API provider.

The eventual production build can switch to the PHP/API provider without replacing the game UI.

### Planned runtime modes

- **GitHub Pages / dev:** static HTML + CSS + ES modules + browser-local save data
- **PHP host / production prototype:** same frontend + PHP session/API backend + JSON or SQL storage

Never commit real player save data, credentials, or secrets.

## V0.2 priorities

1. Import the latest V1 source as the starting point.
2. Preserve working systems while cleaning architecture.
3. Redesign the UI toward a compact garage-management browser game.
4. Add persistent FTUE/tutorial progression.
5. Add Build Stages 1-4 and stage-aware parts.
6. Add engine/chassis separation.
7. Use displacement-only engine-swap rules for the V0.2 prototype:
   - Stage 3: factory displacement +/- 0.6 L
   - Stage 4: factory displacement +/- 1.0 L
8. Prototype procedural side-profile vehicle rendering.
9. Keep racing text/simulation-first for now.
10. Maintain a GitHub Pages-compatible static dev mode.

## Repository workflow

Development should normally happen on feature branches and land through pull requests once a feature is considered complete.

The uploaded/current source in this repository is the source of truth. Old chat snippets and old ZIPs should not override newer repository code.
