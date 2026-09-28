# RPS Arena - Spec v0

## 1. Goal

Build a playable rock paper scissors team fight. Per-side puck counts come
only from `data/roster.json` (not hardcoded in sim or UI). Each side has its
own counts, so a fight can be asymmetric. All pucks are driven by one
hand-written behavior. The player is a spectator. No AI models in v0.

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

`data/types.json`: one object per type. Stats and the damage that type deals
live in the same object. `loadGameData()` splits them into type stats and the
damage matrix.

| Type | Glyph | HP | Speed | Radius | HP band size | Convert HP | vs rock | vs paper | vs scissors |
|---|---|---|---|---|---|---|---|---|---|
| rock | R | 12 | 4.0 | 0.5 | 1/3 | 1/2 | 2 | 1 | 3 |
| paper | P | 12 | 4.0 | 0.5 | 1/3 | 1/2 | 3 | 2 | 1 |
| scissors | S | 12 | 4.0 | 0.5 | 1/3 | 1/2 | 1 | 3 | 2 |

- HP band size: how precisely this type reads an enemy's HP, as a fraction of
  the enemy's max HP. 1/3 gives three bands (high, mid, low).
- Convert HP: in convert mode, the fraction of max HP a puck has after being
  converted into this type.
- Damage: per hit against each defender. Relative to matchup: 3 vs prey,
  2 vs same-tier (peer), 1 vs predator.
- Relationships are derived from those values. A preys on B when A's damage
  vs B is greater than B's damage vs A. Equal values mean same-tier.
- Every attacker has its own 0.8 s hit cooldown.
- Adding a type (for example lizard and spock) is a data change only.

`data/roster.json`: counts per type for side `a` and side `b`. The sides may
differ. This is the sole source of how many pucks spawn on each team. Sim and
UI read it via `loadGameData()`; changing counts is a data edit only. Current
default: 25 rock / 25 paper / 25 scissors on each side.

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
- Valid same-tier engage: a same-tier enemy where own HP is above the top of
  that enemy's seen band.
- Counter ally (offensive): the nearest teammate that preys on this puck's
  current predator's type (derived from the damage matrix). Example: scissors
  whose nearest predator is rock links to the nearest allied paper (paper
  preys on rock).
- Defend ally (defensive): the nearest teammate preyed on by a type this puck
  preys on. Example: scissors defends rock, because scissors preys on paper
  and paper preys on rock (scissors can kill the paper chasing that rock).
- Support ally: the ally steering uses. When this side is behind on seen HP,
  the defensive link wins. Otherwise the offensive link wins. If the preferred
  link is missing, use the other. Ahead/behind uses hysteresis
  (`teamLeadHysteresis`): the lead flag flips only when the seen-HP difference
  exceeds that margin. No shared memory — each puck picks both links from its
  own observation.
- Finish prey: nearest prey distance is at most predator distance times
  `attackOverFlee`. Favors finishing a close kill over fleeing a farther
  predator.
- Gang-up condition: for the nearest predator within `threatEnterRadius`, if
  enough friendly pucks that this predator preys on (self included) are within
  `gangUpRadius` of it, the count meets the gang-up threshold (see below).
  When this side is ahead, the required count is lowered by one (minimum 1).

### State machine

Each puck is always in exactly one state. The state persists between ticks and
has a time-in-state counter. All pucks use identical parameters from
`data/tuning.json` (no per-puck variation). Initial state is Hunting.

**Hunting**: move toward nearest prey. If none, move toward support ally,
else drift toward nearby teammates.

**Engaged**: committed to one target (prey, a gang-up predator, or a valid
same-tier enemy). Move toward that target only.

**Retreating**: flee the nearest predator, harder the closer it is, with a
pull toward the support ally (`counterAllyBias`).

**Regrouping**: move toward whichever is closer: the nearest ally or the
nearest prey.

#### Transitions

Checked every sim step, in the order listed per state.

From any state:
- Gang-up condition met → Engaged, target = that predator.

Hunting:
- Predator within `threatEnterRadius` → Retreating, unless finish prey
  applies, then → Engaged with that prey.
- Prey or valid same-tier enemy within `engageRadius` → Engaged.

Engaged:
- Target dies or is otherwise invalid (dead, same team, or gone) → Regrouping.
- Own HP is at or below `retreatHpFraction` of own max HP → Retreating.
- Time in state exceeds `engageMaxTime` → Regrouping.
- A predator (not the target) enters `threatEnterRadius` and finish prey no
  longer applies → Retreating.

Retreating:
- Within `supportAllyRadius` of the support ally → Regrouping.
- Nearest predator beyond `threatExitRadius` (or no predators) → Regrouping.

Regrouping:
- Predator within `threatEnterRadius` → Retreating.
- Re-engage lockout expired and prey within `engageRadius` → Engaged.
- Time in state exceeds `regroupMaxTime` → Hunting.

Re-engage lockout: after leaving Retreating, the puck cannot enter Engaged,
except via gang-up, for `reengageLockout` seconds.

State change rate: a puck may change state at most
`maxStateChangesPerSecond` times per second (default 2). After a state change,
further state changes are blocked until `1 / maxStateChangesPerSecond`
seconds have elapsed. Retargeting within the same state (for example Engaged
switching targets) does not count as a state change.

#### New tuning parameters (defaults)

| Parameter | Default |
|---|---|
| engageRadius | 2.0 |
| engageMaxTime | 4.0 s |
| threatEnterRadius | 6.0 |
| threatExitRadius | 7.0 |
| supportAllyRadius | 1.5 |
| reengageLockout | 1.5 s |
| regroupMaxTime | 3.0 s |
| retreatHpFraction | 1/3 |
| teamLeadHysteresis | 10% of total max HP on both sides' seen HP |
| maxStateChangesPerSecond | 2 |

`threatEnterRadius` replaces the old single `threatRadius` for enter checks.
`attackOverFlee`, `counterAllyBias`, and `gangUpRadius` remain.

### Gang-up threshold

Derived from the data, not fixed: the smallest group whose combined damage
kills the predator before the predator kills one member of the group,
assuming simultaneous arrival and equal cooldowns. With current v0 numbers
(HP 12, 1 damage into predator / 3 from predator) this is 4.
Staggered arrival is not modeled in v0. The batch tests will show whether
this estimate is good enough.

### Steering

The chosen intent gives a direction. Add:

- Separation: away from any puck within 1.2 units, teammates included.
  Separation exempts the puck's current Engaged target (any type), not all
  prey in general.
- Walls: push away from walls within 2.5 units. Required, or fleeing pucks
  pin themselves in corners.

Sum the weighted terms, normalize, move at the puck's speed.

### Behavior interface

This signature must be kept. Later behaviors plug in here. v0 intent comes
from the state machine in the sim; the machine reads observation and persisted
puck state, then returns a desired direction.

    behavior(observation) -> desired direction

    observation: own type, team, position, exact HP, and lists of prey,
    predators, same-tier enemies, and teammates, each with relative position
    and seen HP band

### Visible state

- Each puck shows its state as a small square at the base of its HP bar:
  - Hunting: empty (stroke only)
  - Engaged: solid fill in team color
  - Retreating: solid amber fill
  - Regrouping: hollow thick-border square
- Must be readable on a phone at the zoom-out limit. If it is not, increase
  marker size slightly, not puck size.
- A small legend for the four styles in the UI panel.
- Tapped puck: show state name, time in state, current target, and lines to
  target and support ally.
- Status line: count of pucks in each state per side.

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
- Tap a puck: show type, team, HP, state name, time in state, current target,
  and lines to its Engaged target (when any) and support ally. Prey (green),
  predator (red), counter ally (cyan), and defend ally (violet) lines remain
  when those exist.
- State marker legend in the UI panel (Hunting empty, Engaged solid team,
  Retreating amber, Regrouping hollow).
- Controls: pause (button or Space), 1x, 4x, restart with same seed, restart with new seed,
  combat mode selector.
- Status line: seed, elapsed time, pucks remaining per side, and count of
  pucks in each state per side.
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
- State machine: each transition above with a constructed scenario; re-engage
  lockout blocks Engaged but not gang-up; Engaged ends on target death, low
  HP, and timeout; separation does not push away from the Engaged target.
- Batch: 100 headless matches per combat mode, reporting win rate per side,
  draw rate, stalemate rate, mean match length, state changes per puck per
  minute, and time share in each state. With symmetric data, side win rates
  should be close to even.

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
