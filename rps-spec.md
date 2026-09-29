# RPS Arena - Spec v0

## 1. Goal

Build a playable rock paper scissors team fight. The playfield starts empty.
Each side earns spawn charges and spends them to create units. The player
spends Team A's charges. Team B is a computer opponent. All pucks are driven
by one hand-written behavior. No AI models in v0.

This version is the baseline. Later versions replace or extend the hand-written
behavior with model-authored behaviors, which must beat this baseline in
headless matches.

v0 includes camera zoom and pan (spectator view only).

## 2. Arena

- Portrait, phone-first. Arena is 48 x 75 units (1 unit ~ 1 m).
- Canvas scales to fit the viewport, letterboxed. Must work at 390px width.
- No obstacles in v0.
- The playfield starts empty. There is no starting roster.
- Each side has a spawn zone: a circle of radius `spawnZoneRadius` (default
  1.0). The circle sits against the arena's short edge and is fully inside
  the field. Team A is centered at `(arenaWidth / 2, spawnZoneRadius)` (bottom).
  Team B is centered at `(arenaWidth / 2, arenaHeight - spawnZoneRadius)` (top).
  Both zones are drawn in team color.
- All randomness comes from one seeded PRNG. The seed is shown on screen and
  can be set with `?seed=` in the URL.

## 3. Types (data-driven)

All type stats and matchups come from data files, not code.
v0 values are symmetric. Asymmetric types are on the roadmap.

`data/types.json`: one object per type. Stats and the damage that type deals
live in the same object. `loadGameData()` splits them into type stats and the
damage matrix.

| Type | Glyph | Shape | HP | Speed | Radius | HP band size | Convert HP | vs rock | vs paper | vs scissors |
|---|---|---|---|---|---|---|---|---|---|---|
| rock | R | circle | 12 | 4.0 | 0.5 | 1/3 | 1/2 | 2 | 1 | 3 |
| paper | P | square | 12 | 4.0 | 0.5 | 1/3 | 1/2 | 3 | 2 | 1 |
| scissors | S | triangle | 12 | 4.0 | 0.5 | 1/3 | 1/2 | 1 | 3 | 2 |

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

`data/tuning.json`: steering, combat, spawn zones, charge rate, and the
state-machine parameters below. There is no roster file.

Team colors: Team A blue fill, Team B orange fill, white glyph. A missing
or unknown `shape` is drawn as a circle.

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

**Hunting**: move toward the nearest prey inside `huntRadius`. Hunting does
not steer toward a support ally or teammates.

**Advancing**: move toward the enemy spawn zone center. Separation and wall
steering still apply. New units spawn in Advancing.

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
- No prey within `huntRadius` → Advancing.

Advancing:
- Predator within `threatEnterRadius` → Retreating, unless finish prey
  applies, then → Engaged with that prey. Gang-up (checked for every state)
  still takes priority.
- Prey within `huntRadius` → Hunting.

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
- Time in state exceeds `regroupMaxTime` → Advancing.

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
| huntRadius | 8.0 |
| spawnZoneRadius | 1.0 |
| chargeInterval | 3.0 s |
| chargeCap | null (no cap) |
| spawnOffset | 0.6 |

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

- The puck body is its type shape, filled with the team color: circle, square,
  or equilateral triangle. The three shapes are scaled to about the same filled
  area, not the same circumradius. The triangle points toward the enemy spawn
  zone: up for Team A, down for Team B. A missing or unknown shape is a circle.
- The glyph is always drawn, in white, at 1.2 times the collision radius in
  device pixels. Shape and team color still identify the type when the letter
  is small.
- Each puck shows its state as a square at the base of its HP bar:
  - Hunting: empty (stroke only)
  - Engaged: solid fill in team color
  - Retreating: solid amber fill
  - Regrouping: hollow thick-border square
  - Advancing: white square
- HP bar height, state-marker size (clamped between 4 and 7 CSS px), and
  selection-ring width are CSS pixels times the device pixel ratio. At the
  zoom-out limit a puck is about 8 CSS px across, and a marker that small
  cannot be read. The HP bar and state marker are hidden when the puck's
  on-screen diameter is below 16 CSS px. Shape and team color stay visible.
  Do not shrink the marker below 4 CSS px to force it onto a smaller puck.
- The selection ring is a circle around the shape, the same circle for every
  type. Minimap marks stay dots.
- A small legend for the five state styles and the three shapes in the UI panel.
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

## 6. Spawn charges

- Each side gains 1 charge every `chargeInterval` seconds (default 3.0),
  starting at 0 when the match begins. Progress toward the next charge is
  continuous; the charge is granted when a full interval has elapsed.
- Unused charges bank. `chargeCap` in `data/tuning.json` limits the bank.
  Default is null, which means no cap.
- Spending a charge spawns one unit of the chosen type at that side's spawn
  zone center plus a random offset of at most `spawnOffset` units (default
  0.6), drawn from the seeded PRNG as a point in a disk. The spawn position
  is clamped inside the arena.
- Several spawns in the same tick each get their own offset.
- New units start in Advancing.
- Player inputs are recorded as `(tick, type)` and applied on that sim tick
  so a match can be replayed.

## 7. Player controls

- Three buttons across the bottom of the screen, outside the arena canvas:
  R, P, S. Each is at least 44px tall. The row is full width, split three
  ways, usable with one thumb.
- The row shows the current charge count and a progress indicator for the
  next charge.
- Pressing a button with at least one charge spends it and records
  `(tick, type)`. With zero charges the button looks disabled and does
  nothing.
- Because the buttons sit in the chrome below the canvas, they do not cover
  the minimap or Team A's spawn zone. The minimap is hidden at the zoom-out
  limit.

## 8. Computer opponent

- Team B spends every charge on the tick it is gained. It never banks.
- Each spend is a uniformly random type from the seeded PRNG.
- The opponent is a function `chooseSpawn(state) -> type | null`. Null means
  do not spend (used by tests and by a later, smarter opponent). The default
  opponent returns a random type whenever `state.charges > 0`.

## 9. Victory

- A side wins the moment any of its units overlaps the enemy spawn zone
  (circle overlap: distance between centers ≤ unit radius + zone radius).
- If both sides overlap on the same tick, the match is a draw.
- There is no stalemate timer and no win by emptying the other side.
- End screen: winner, match time, units spawned per side, units lost per side.
  A unit is lost when it is removed at 0 HP. Convert is not a loss.
- Restart with the same seed or a new seed, as before.

## 10. UI

- The player spawns Team A. They do not steer individual pucks.
- Tap a puck: show type, team, HP, state name, time in state, current target,
  and lines to its Engaged target (when any) and support ally. Prey (green),
  predator (red), counter ally (cyan), and defend ally (violet) lines remain
  when those exist.
- State and shape legend in the UI panel. States: Hunting empty, Engaged
  solid team, Retreating amber, Regrouping hollow, Advancing white. Shapes:
  rock circle, paper square, scissors triangle.
- Controls: pause (button or Space), 1x, 4x, restart with same seed, restart
  with new seed, combat mode selector, and the R / P / S spawn row from
  section 7.
- Status line: seed, elapsed time, pucks remaining per side, charge count, and
  count of pucks in each state per side.
- End screen: see section 9.
- Tap targets at least 44px. No layout breakage at 390px width.

## 11. Camera

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

## 12. Technical

- TypeScript strict, Vite, single Canvas 2D.
- bitECS for entity storage.
- Fixed 60 Hz step with an accumulator, own loop.
- Sim code has no imports from rendering or UI, so it runs headless.

### Tests

- Charges accumulate at `chargeInterval` and bank when `chargeCap` is null.
- `chargeCap`, when set, is respected.
- Spawning spends a charge. Zero charges spawns nothing.
- Multiple spawns in the same tick get distinct offsets.
- Zone victory triggers on overlap and not before. A lone unit on an empty
  field advances into the enemy zone and wins.
- The default computer spends every charge on the tick it arrives.
- Determinism: the same seed and the same list of player inputs `(tick, type)`
  give the same result.
- Relationship derivation from the damage matrix.
- Gang-up threshold derivation from the data.
- HP band perception at band edges.
- Hit cooldown.
- State machine: each transition above with a constructed scenario; re-engage
  lockout blocks Engaged but not gang-up; Engaged ends on target death, low
  HP, and timeout; separation does not push away from the Engaged target.

Do not automate UI testing. A person checks it on a phone.

## 13. Out of scope for v0

Models (Jev, Astra), player orders, abilities, obstacles, shared blackboard,
sound, art.

## 14. Roadmap

- Asymmetric types via data.
- Additional types (rock paper scissors lizard spock).
- Shared blackboard so pucks can claim targets and coordinate.
- Jev picks among behaviors each second.
- Astra authors new behaviors, verified in headless matches against this
  baseline before install.
