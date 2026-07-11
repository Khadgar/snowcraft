# SnowCraft

A faithful browser remake of the 1999 Flash game **SnowCraft** — command a lone
snowball fighter (who respawns while you have lives left) in a fast, cartoony
snowball fight against an AI squad. Built with **Three.js + TypeScript + Vite**
using a data-oriented, ECS-inspired architecture where the simulation is fully
decoupled from rendering.

Built to the specification in [`design.md`](./design.md).

## Quick start

```bash
npm install
npm run dev        # start the dev server (http://localhost:5173)
```

Open the URL, pick a **map**, **AI difficulty**, and **sound** option on the
main menu, then click **Start Battle**.

## Controls

Your fighter is always selected for you — no clicking or `Tab` needed.

| Action | Input |
| --- | --- |
| Move | `WASD`, or right-click a destination |
| Aim & throw | Hold the left mouse over the battlefield to aim (power grows), release to throw. Aiming can't be cancelled or interrupted once started |
| Pause | `Esc` or `P` |
| Debug overlay | `` ` `` (backtick) to toggle, number keys `1`–`6` for categories |

Set **Your Lives** (respawns — when your fighter is eliminated it reappears at a
random spot with 5s immunity while any remain), the number of **Opponents**,
**Enemy Lives** (hits to defeat each enemy), the **AI** skill, and **Buffs**
(arena pickups: extra life, 5s immunity, speed boost — collectible by you, both
teams, or off) on the main menu. Win by eliminating the entire enemy squad; lose
when you run out of lives.

## Scripts

```bash
npm run build      # type-check + production build (dist/)
npm run preview    # preview the production build
npm run typecheck  # strict TypeScript, no emit
npm run lint       # ESLint (strict, no `any`)
npm run format     # Prettier
npm run test       # Vitest unit tests (pure simulation logic)
```

### Browser smoke tests

These drive the running dev server with a headless system browser
(`puppeteer-core`) to verify the game actually boots and plays. Start the dev
server first, then:

```bash
npm run smoke              # boots, renders, simulation clock advances
npm run smoke:interaction  # click-select + right-click move
npm run smoke:combat       # AI-driven throw → collision → damage
```

Set `CHROME_PATH` to point at your Chrome/Edge binary if auto-detection fails,
and `SMOKE_URL` to target a non-default dev URL.

## Deployment

The app is deployed to **GitHub Pages** at
**https://khadgar.github.io/snowcraft/** by the
[`Deploy to GitHub Pages`](./.github/workflows/deploy-pages.yml) workflow.

- It runs automatically on every push to `main`, and can also be triggered
  manually from the **Actions** tab (`Run workflow`).
- The workflow runs `npm ci && npm run build` and publishes `dist/` — no
  `gh-pages` branch is used. Vite's `base: './'` keeps all asset and map paths
  relative, so the game works under the `/snowcraft/` project sub-path.

**One-time setup:** in the repository, go to **Settings → Pages → Build and
deployment** and set **Source** to **GitHub Actions**. This is required once for
the deploy job to publish.

## Architecture

One-way data flow (design §8, §25): **Simulation → Renderer → Three.js**. Game
logic never imports Three.js and never queries meshes; renderers observe plain
simulation data.

- **Fixed timestep** simulation at 60 Hz with an accumulator; rendering runs at
  the display refresh with interpolation (`core/GameLoop.ts`).
- **Update order** each step: Input → AI → Movement → Throw → Projectile →
  Collision → Damage → Round → Animation (`core/Game.ts`).
- **Decoupling seams**: a typed `EventBus` (`core/EventBus.ts`) and
  command-based input (`core/commands.ts`, `engine/InputManager.ts`).
- **Pooling** for snowballs, particles and temporary vectors — no per-frame
  allocations in hot paths (design §26).
- **Procedural art**: everything is built from Three.js primitives; audio is
  synthesized with the Web Audio API. No external asset files.

```
src/
  core/      Game loop, orchestrator, event bus, input commands
  ecs/       Entity/component/system contracts
  engine/    Renderer, camera, input, audio, assets, settings
  game/      Entity data + FSM, world state, arena/map loading, config
  systems/   AI, movement, throwing, projectile, collision, damage, round, animation
  physics/   Collision primitives, spatial hash, line-of-sight, pathfinding
  render/    Arena/player/particle renderers
  ui/        HUD, menus, debug overlay
  utils/     Vector2, math, RNG, object pool
public/maps/ Arena definitions (JSON)
```

## Extending

- **New maps**: drop a JSON file in `public/maps/` (see `arena1.json`) and add it
  to the `MAPS` list in `src/main.ts`.
- **Tuning**: gameplay constants live in `src/game/config.ts`.
- **New systems/renderers**: implement the `System` / `GameRenderer` interface
  and register it in `src/main.ts`.

The decoupled design intentionally leaves room for the future work listed in
`design.md` §32 (multiplayer, replays, map editor, etc.).
