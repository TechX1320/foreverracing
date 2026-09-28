# V0.4A Race Presentation Research

Research date: 2026-09-28.

Forever Racing's V0.3B race simulator could determine a complete race immediately, but presenting the answer immediately made racing feel like a button-spammable calculator. V0.4A separates **simulation** from **presentation**.

## References reviewed

### Motor Matchup

- Site: https://www.motormatchup.com/
- Developer update: https://www.reddit.com/r/cars/comments/1scct4d/i_posted_my_drag_racing_simulator_here_5_years/
- The developer describes a physics-based simulator with a 3D race mode and multiple camera angles.
- Takeaway for Forever Racing: even when the underlying simulation is deterministic/calculated, visual playback gives the result weight and context.

### Top Drives

- Help: https://hutch.helpshift.com/hc/en/13-top-drives/faq/649-how-do-i-speed-up-a-race/
- Automated races are still presented as races; the player can speed or skip presentation.
- Takeaway: simulation and presentation can remain separate. Forever Racing intentionally does **not** expose skip/fast-forward in V0.4A because the current design goal is to prevent instant race spamming.

### FreeSimulators Drag Racing Simulator

- https://freesimulators.com/drag-race-simulator/
- Uses a live starting tree, real-time two-car race animation and a timing slip after the pass.
- Takeaway: tree -> race movement -> timing slip is an immediately understandable drag-racing sequence for a browser.

### Nitro Type

- https://www.nitrotype.com/
- Cars visibly represent player progress on the track while the race is happening; Nitro Type has also iterated on track animation/effects over time.
- Takeaway: a moving car plus a readable progress representation is effective even when the game itself is not a driving simulator.

### The Strip

- https://www.thestrip.io/
- Browser drag-racing presentation includes staging, live race state, gauges/controls and explicit visual-effects modes.
- Takeaway: a browser UI can make the racing scene feel materially different from the management screens without requiring a full 3D engine.

## V0.4A design decision

Forever Racing uses a hybrid appropriate for the current top-down art pipeline:

1. **Stage & Run** creates and persists the race result internally.
2. No rewards or records are committed yet.
3. A blocking modal owns the screen.
4. Pre-stage/stage and the drag tree play.
5. Two top-down cars advance down a two-lane strip over the simulation's real reaction/ET duration.
6. Progress bars mirror the visual movement for immediate readability.
7. Once both cars are through the traps, the server/local provider finalizes the race.
8. Only then are rewards, records and the timing slip revealed.
9. The player returns to the pits.

This keeps V1 racing math-automated while leaving room for future reaction, launch, shift and NOS inputs to influence the same stored race lifecycle.
