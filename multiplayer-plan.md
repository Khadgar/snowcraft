# SnowCraft — 1v1 Online Multiplayer Plan (server-authoritative)

> An architecture + effort estimate for making SnowCraft playable **1v1 online**,
> while keeping the existing **single-player vs AI** mode. This is a planning
> document — no implementation is described here. Effort is sized in relative
> complexity (S / M / L / XL), not time.

## Goal & decisions
- Keep **Single Player vs AI** exactly as today.
- Add **"Play Online"**: 1v1 PvP — your hero vs another human's hero.
- **Server component + WebSocket** for communication.
- **POV-relative colors:** each player always sees *themselves* as **blue**
  (Player) and the **opponent** as **red** (Enemy). Team→color is a client-side
  presentation mapping, not a simulation fact.

## The big enabler (why this is very feasible)
The simulation is already **100% Three.js-free** — zero `three` imports in
`core/`, `game/`, `systems/`, `physics/`, `ecs/`, `utils/` (only `render/` and
`ui/` touch Three/Preact). The loop is a **deterministic fixed-timestep** sim
(`core/GameLoop.ts`) with a **seeded PRNG** (`utils/Random.ts`, mulberry32) and
server-allocatable ids (`ecs/Entity.ts` `IdAllocator`). Renderers already observe
**plain data** and interpolate. → The entire sim can run **headless on Node**, and
the client renderers barely change. This is the single biggest reason the effort
is moderate rather than a rewrite.

## Recommended netcode model: server-authoritative snapshots
- **Server (Node + `ws`)** runs the authoritative `World` + systems at 60 Hz per
  room; owns RNG, ids, and any AI. Receives **input commands** from each client,
  applies them to that client's hero, and broadcasts **world snapshots**
  (~20–30 Hz) to both clients.
- **Client** has two modes:
  - *Single Player:* runs the sim locally, unchanged.
  - *Online:* does **not** run sim systems; sends local input commands; applies
    incoming snapshots into a render-only `World` and interpolates between them.
- **Alternative considered — deterministic lockstep** (send only inputs, both
  peers simulate): tempting because the sim is deterministic, but cross-platform
  **floating-point** determinism (`Math.sin/cos/sqrt/atan2` in trajectory/AI/
  knockback) is a real hazard, and it needs input-delay or rollback.
  Server-authoritative avoids the determinism rabbit hole and is more
  cheat-resistant. **Chosen: server-authoritative.**

## POV-relative colors (explicit requirement)
- The sim identifies units by a stable **team id** (team 0 / team 1) +
  **ownership** (which connection, or AI). Colors are **not** decided by the sim.
- Each client is told "you are team X"; renderers map **my team → blue (Player)**,
  **other team → red (Enemy)**. Centralized today in `TEAM_COLORS` and read in a
  few renderers/HUD, so this is contained (see workstream E).

## Workstreams & effort

### A. Shared-code / build restructure — M
- Make the sim importable by both the Vite client and a Node server (npm
  workspaces monorepo: `client` / `server` / `shared`, or a `shared/` dir with a
  server `tsconfig` + `tsup`/esbuild build). Add `ws`.
- Risk: bleeding-edge toolchain (Vite 8 / TS 6); keep the client build intact.

### B. Server component — L
- WebSocket server; **lobby/matchmaking** (create/join room or quick-match, pair
  two clients into a 1v1 room); per-room 60 Hz authoritative loop; input intake;
  snapshot broadcast; connection lifecycle (join/leave/**disconnect**/timeout).
- **Wire protocol** (message types: `hello/join`, `matchFound`, `input`,
  `snapshot`, `roundStart`, `roundEnd`, `error`) + (de)serialization.

### C. Team/ownership refactor (touches existing gameplay) — L
- Introduce **ownership** (localHuman / remoteHuman(id) / AI) distinct from
  **team identity**. This is the deepest change and must **keep SP behavior + all
  120 tests green**.
- Generalize the hardcoded `Team.Player` assumptions:
  - Control gating in `MovementSystem`/`ThrowSystem`: "unit controlled by *this*
    input source" instead of `Team.Player && selected`.
  - `AISystem`: drive only **AI-owned** units; target the opposing team generally.
  - `DamageSystem`: make PvP **symmetric** — the `ENEMY.*` handicaps
    (`hitStunScale`, `knockbackScale`, `moveSpeedScale`) and "player can't be
    knocked out of a throw" become **AI-only / config-driven**, not global.
  - `RoundSystem`/lives: per-team lives; win = opponent out of lives.

### D. Networking client layer — L
- `NetworkClient` (WebSocket) + a **snapshot-fed render world** with an
  interpolation buffer (adapt the renderer's `alpha` interpolation to interpolate
  between *snapshots*, with ~100 ms delay to smooth jitter). Send local input.
- **Phase 2 (separate, +L):** client-side **prediction + reconciliation** for the
  local hero (responsiveness under latency) and lag-compensated hit checks. A v1
  can ship with interpolation-only (opponent smooth, local input has RTT lag).

### E. POV-relative rendering — S–M
- A "local perspective" (my team id) threaded to `PlayerRenderer`, HUD,
  Nav/Aim indicators, and the result screen so colors/labels are relative. Small
  because color is centralized and team is read in only a handful of spots.

### F. Mode switch + lobby UI — M
- Menu: **Single Player** vs **Play Online**. Online flow: confirm name → connect
  → create/join or quick-match → **waiting for opponent** → in-game → disconnect/
  result → **rematch**. Extends the Preact menus. `main.ts` composition branches
  on mode (local sim vs `NetworkClient`).

### G. Match lifecycle & edge cases — M
- No live pause in MP (pause = SP-only; online could be forfeit/abort); disconnect
  → opponent wins / short reconnect window; authoritative round end; server-side
  result. (MP/global leaderboard is **future**, see below.)

### H. Testing & validation — M
- Keep the 120 existing tests green through the ownership refactor (this is the
  main regression risk). Unit-test serialization + ownership/targeting. Add a
  **two-headless-client integration test** against a local server (node sockets or
  extend the puppeteer harness). Determinism not required (server is truth), but
  snapshot correctness is.

## Suggested phased roadmap (critical path)
1. **Phase 0 — Foundations:** A (shared build) + C (ownership refactor, SP still
   green). Nothing user-visible yet; de-risks the hardest part first.
2. **Phase 1 — Playable 1v1 (interpolation only):** B (server + lobby) + D (client
   net + snapshot interp) + E (POV colors) + F (online menu) + G (basic lifecycle)
   + H. Ship: two players, smooth opponent, local input has RTT latency.
3. **Phase 2 — Feel & robustness:** client prediction + reconciliation, lag
   compensation, reconnection, disconnect UX polish.
4. **Phase 3 — Ops/future (optional):** server hosting/containerization & room
   scaling; server-side global leaderboard/accounts; >2 players / spectators.

## Overall sizing
A large, multi-phase project: **~5 L/XL workstreams + several M**. A **Phase-1
playable 1v1** is a realistic first milestone; **Phase 2 (prediction) is where the
"feel" is** and is comparable in effort to the initial netcode. The decoupled,
Three-free, deterministic sim removes what is usually the biggest cost, so the
dominant costs here are: the **server + lobby (B)**, the **ownership refactor
without breaking SP (C)**, and **client netcode/interp (D)**.

## Risks & mitigations
- **Ownership refactor regresses SP** → keep `ENEMY.*` handicaps behind an
  AI-only flag; lean on the 120 tests; refactor before any netcode.
- **Latency feel** → ship interpolation-only first; add prediction in Phase 2.
- **Determinism** → sidestepped by server-authoritative (don't pick lockstep).
- **Toolchain** (Vite 8 / TS 6 / new server build) → validate the shared-build
  spike early in Phase 0.
- **Bandwidth** → world is tiny (few units + snowballs + pickups); full snapshots
  at 20–30 Hz are cheap; delta-compression is a later optimization, not needed v1.

## Out of scope / future
Global/online leaderboard & accounts, matchmaking ranking, >2 players, spectators,
anti-cheat hardening, and production hosting/scaling.
