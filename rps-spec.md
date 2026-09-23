# RPS Arena - Spec v0

## 1. Goal

Build a playable rock paper scissors team fight. Per-side puck counts come
only from `data/roster.json` (not hardcoded in sim or UI). Both sides use the
same roster. All pucks are driven by one hand-written behavior. The player is
a spectator. No AI models in v0.

This version is the baseline. Later versions replace or extend the hand-written
behavior with model-authored behaviors, which must beat this baseline in
headless matches.

v0 includes camera zoom and pan (spectator view only).

## 2. Arena

- Portrait, phone-first. Arena is 48 x 75 units (1 unit ~ 1 m).
- Canvas scales to fit the viewport, letterboxed. Must work at 390px width.
- No obstacles in v0.
- Team A spawns in the bottom third, Team B in the top third.
- Spawn order is random per side: shuffle the roster, place pucks in rows with
  small random jitter.
- All randomness comes from one seeded PRNG. The seed is shown on screen and
  can be set with `?seed=` in the URL.

## 3. Types and roster (data-driven)

All type stats, matchups, and the roster come from data files, not code.
v0 values are symmetric. Asymmetric types are on the roadmap.

`data/types.json`

| Type | Glyph | HP | Speed | Radius | HP band size | Convert HP |
|---|---|---|---|---|---|---|
| rock | R | 6 | 4.0 | 0.5 | 1/3 | 1/2 |
| paper | P | 6 | 4.0 | 0.5 | 1/3 | 1/2 |
| scissors | S | 6 | 4.0 | 0.5 | 1/3 | 1/2 |

- HP band size: how precisely this type reads an enemy's HP, as a fraction of
  the enemy's max HP. 1/3 gives three bands (high, mid, low).
- Convert HP: in convert mode, the fraction of max HP a puck has after being
  converted into this type.

`data/damage.json`: damage[attacker][defender] per hit

|  | vs rock | vs paper | vs scissors |
|---|---|---|---|
| rock | 1 | 1 | 2 |
| paper | 2 | 1 | 1 |
| scissors | 1 | 2 | 1 |

- Relationships are derived from the matrix. A preys on B when
  damage[A][B] > damage[B][A]. Equal values mean same-tier.
- Every attacker has its own 0.8 s hit cooldown.
- Adding a type (for example lizard and spock) is a data change only.

`data/roster.json`: count per type per side. This is the sole source of how
many pucks spawn on each team. Sim and UI read it via `loadGameData()`;
changing counts is a data edit only. Current default: 9/9/9 (27 per side).

`data/tuning.json`: threat radius, gang-up radius, cooldown, stalemate timeout, steering weights.

Team colors: Team A blue fill, Team B orange fill, white glyph.

## 4. Behavior (v0, hand-written)

### Perception

- Own HP: exact.
- Enemy HP: seen as a band. Band size is set by the observer's type
  (`HP band size`, default 1/3 of max HP, giving high, mid, low).
- Positions of all pucks are visible.
- No shared memory or messaging between pucks in v0. Every puck decides from
  its own perception.

### Terms

- Prey: an enemy this puck preys on.
- Predator: an enemy that preys on this puck.
- Same-tier enemy: neither preys on the other (same type in v0).

### Intent, in priority order

1. **Gang-up.** For the nearest predator within the threat radius (start 6
   units): if enough friendly pucks that this predator preys on, self
   included, are within the gang-up radius (start 3 units) of it, engage it.
   The required count is the gang-up threshold (see below).
2. **Flee.** Otherwise, move away from the nearest predator within the threat
   radius. Weight rises sharply as it gets closer.
3. **Seek.** Move toward the nearest prey.
4. **Same-tier fight.** Engage a same-tier enemy only with an HP advantage:
   own HP is above the top of the enemy's seen band. Otherwise keep clear.
5. **Idle.** Nothing to do: hold near teammates.

### Gang-up threshold

Derived from the data, not fixed: the smallest group whose combined damage
kills the predator before the predator kills one member of the group,
assuming simultaneous arrival and equal cooldowns. With v0 numbers this is 3.
Staggered arrival is not modeled in v0. The batch tests will show whether
this estimate is good enough.

### Steering

The chosen intent gives a direction. Add:

- Separation: away from any puck within 1.2 units, teammates included.
- Walls: push away from walls within 2.5 units. Required, or fleeing pucks
  pin themselves in corners.

Sum the weighted terms, normalize, move at the puck's speed.

### Behavior interface

This signature must be kept. Later behaviors plug in here.

    behavior(observation) -> desired direction

    observation: own type, team, position, exact HP, and lists of prey,
    predators, same-tier enemies, and teammates, each with relative position
    and seen HP band

## 5. Combat

Combat mode is a match setting:

| Mode | On contact |
|---|---|
| damage | Both sides hit using the damage matrix. |
| instant_kill | Prey is removed. Same-tier contact does nothing. |
| convert | Prey switches to the attacker's team and type, with HP set to that type's `Convert HP` fraction of max. Same-tier contact does nothing. |

- A puck at 0 HP is removed.
- Contact with a teammate: no damage, collision separates them.
- Collision: circle overlap, push both apart along the center line by half the
  overlap. Clamp to arena bounds.

## 6. Win and stalemate

- A team wins when the other has no pucks left.
- Stalemate is expected (for example only Team A rocks and Team B paper remain:
  paper chases, rock flees and has no prey). If no hit lands for 20 s, the
  match ends and the team with more total HP wins. Equal HP is a draw.
- Applies to all combat modes.

## 7. UI

- Spectator only in v0.
- Tap a puck: show type, team, HP, and lines to its current prey and predator.
- Controls: pause, 1x, 4x, restart with same seed, restart with new seed,
  combat mode selector.
- Status line: seed, elapsed time, pucks remaining per side.
- End screen: winner, time, survivors, reason (elimination or stalemate).
- Tap targets at least 44px. No layout breakage at 390px width.

## 8. Camera

- Camera state lives in the rendering layer only. The sim has no knowledge of
  the camera. Headless runs and determinism are unaffected.
- World size is fixed (see section 2). It does not change per device.
- Zoom out limit: the whole arena fits in the viewport, centered, with empty
  bands on the sides that do not match the viewport's aspect ratio (letterbox).
- Zoom in limit: the viewport's short side shows `maxZoomInPucksAcross` puck
  diameters. Value in `data/tuning.json`, default 16.
- If the zoom-in limit would be wider than the fit view, the zoom-in limit
  equals the fit view (no zoom available).
- Zoom anchors on the pinch midpoint or cursor position: the world point under
  it stays under it.
- Pan clamping, per axis:
  - If the arena is larger than the viewport on that axis, the arena edge may
    not move inside the viewport edge.
  - If the arena is smaller than the viewport on that axis, it is centered on
    that axis and cannot be panned.
- Clamping is applied after every zoom and pan, and on viewport resize or
  rotation.

Input:
- Touch: one-finger drag pans. A touch that moves less than 10 px before
  release is a tap (selects a puck). Two-finger pinch zooms and pans together.
- Desktop: mouse wheel zooms toward the cursor. Left-drag pans. Click with less
  than 10 px of movement selects.
- The canvas sets `touch-action: none` so the browser does not zoom the page.

Minimap:
- Shows the whole arena, every puck as a dot in its team color, and a rectangle
  for the current viewport.
- Tap or drag on the minimap centers the viewport on that point (then clamp).
- Hidden when zoom is at the zoom-out limit.
- Placed in a corner, semi-opaque background, at most 30% of the viewport's
  short side. Does not intercept input outside its own bounds.
- Input on the minimap never reaches the main canvas.

Tests (headless, camera math only):
- Fit zoom computed correctly for portrait, landscape, and square viewports.
- Zoom anchor: the world point under the anchor is unchanged after zoom.
- Clamping on both axes, for arena larger and smaller than the viewport.
- Zoom limits respected, including the case where no zoom is available.
- Screen-to-world and world-to-screen round trip.

## 9. Technical

- TypeScript strict, Vite, single Canvas 2D.
- bitECS for entity storage.
- Fixed 60 Hz step with an accumulator, own loop.
- Sim code has no imports from rendering or UI, so it runs headless.

### Tests

- Determinism: same seed and mode give identical results.
- Relationship derivation from the damage matrix.
- Gang-up threshold derivation from the data.
- HP band perception at band edges.
- Hit cooldown.
- Stalemate timer.
- Batch: 100 headless matches per combat mode, reporting win rate per side,
  draw rate, stalemate rate, and mean match length. With symmetric data, side
  win rates should be close to even.

Do not automate UI testing. A person checks it on a phone.

## 10. Out of scope for v0

Models (Jev, Astra), player orders, abilities, obstacles, shared blackboard,
sound, art.

## 11. Roadmap

- Asymmetric types via data.
- Additional types (rock paper scissors lizard spock).
- Shared blackboard so pucks can claim targets and coordinate.
- Jev picks among behaviors each second.
- Astra authors new behaviors, verified in headless matches against this
  baseline before install.
