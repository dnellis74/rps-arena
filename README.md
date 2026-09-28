# RPS Arena

Rock-paper-scissors team fights. The field starts empty. Each side
earns charges and spends them to spawn units (Team A by the player, Team B by
a random opponent). Type stats and damage live in `data/types.json`.

## Requirements

- Node.js 20+

## Run the app

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:4721](http://127.0.0.1:4721) only — RPS is locked to port
**4721** (`strictPort`; never falls back to 5173). Optional seed query:
`?seed=12345`.

Controls: pause (button or Space), 1x / 4x, restart same seed, new seed, combat mode selector.
Tap a puck to inspect type, team, HP, and lines to its current prey / predator.

## Run tests

```bash
npm test
```

Headless-only coverage: determinism, relationship derivation, gang-up threshold,
HP bands, hit cooldown, stalemate timer, and 100-match batches per combat mode.
UI is not automated.

## Layout

| Path | Role |
|---|---|
| `data/` | Types (stats and damage) and tuning |
| `src/sim/` | Headless simulation (no render/UI imports) |
| `src/behavior/` | Hand-written v0 behavior (`behavior(observation) -> direction`) |
| `src/render/` | Canvas 2D drawing |
| `src/main.ts` | Spectator shell + fixed 60 Hz loop |
| `tests/` | Vitest suite |

## Combat modes

- **damage** — both sides hit using the damage matrix (0.8 s cooldown)
- **instant_kill** — prey removed on contact; same-tier contact does nothing
- **convert** — prey joins the attacker's team/type at convert HP
