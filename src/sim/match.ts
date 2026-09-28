import { resolveContacts } from './combat.ts'
import { stepMovement } from './movement.ts'
import { type SpawnChooser, randomOpponent } from './opponent.ts'
import { SeededRng } from './rng.ts'
import { overlapsSpawnZone, spawnPosition } from './spawn.ts'
import {
  PUCK_STATE_NAMES,
  PuckStates,
  type CombatMode,
  type DamageMatrix,
  type MatchResult,
  type PuckStateId,
  type PuckStateName,
  type SpawnInput,
  type TeamId,
  type TuningData,
  type TypeId,
  type TypesData,
} from './types.ts'
import {
  aliveEntities,
  createSimWorld,
  spawnPuck,
  type EcsWorld,
  type SimWorld,
} from './world.ts'

type QueuedSpawn = SpawnInput & { applied: boolean }

export type Match = {
  world: EcsWorld
  damage: DamageMatrix
  seed: number
  mode: CombatMode
  rng: SeededRng
  inputs: QueuedSpawn[]
  opponent: SpawnChooser
}

const ENTITY_CAP = 4096

export function createMatch(opts: {
  types: TypesData
  damage: DamageMatrix
  tuning: TuningData
  mode: CombatMode
  seed: number
  inputs?: SpawnInput[]
  opponent?: SpawnChooser
}): Match {
  const rng = new SeededRng(opts.seed)
  const world = createSimWorld(
    opts.types,
    opts.tuning,
    opts.mode,
    ENTITY_CAP,
  ) as EcsWorld
  return {
    world,
    damage: opts.damage,
    seed: opts.seed,
    mode: opts.mode,
    rng,
    inputs: (opts.inputs ?? []).map((input) => ({ ...input, applied: false })),
    opponent: opts.opponent ?? randomOpponent(rng),
  }
}

/**
 * Queue a Team A spawn for the upcoming tick. Returns false when that tick
 * has no unspent charge left.
 */
export function queueSpawn(match: Match, type: TypeId): boolean {
  const tick = match.world.tick
  let pending = 0
  for (const input of match.inputs) {
    if (!input.applied && input.tick === tick) pending++
  }
  if (match.world.charges[0] - pending < 1) return false
  match.inputs.push({ tick, type, applied: false })
  return true
}

/** Recorded player inputs, in queue order. */
export function recordedInputs(match: Match): SpawnInput[] {
  return match.inputs.map(({ tick, type }) => ({ tick, type }))
}

/** One fixed-timestep simulation step. */
export function stepMatch(match: Match): void {
  const { world, damage } = match
  if (world.finished) return

  const dt = world.tuning.fixedDt
  accrueCharges(world)
  applyPlayerSpawns(match)
  applyComputerSpawns(match)

  const { components } = world
  for (const eid of aliveEntities(world)) {
    if (components.HitCooldown[eid]! > 0) {
      components.HitCooldown[eid]! -= dt
      if (components.HitCooldown[eid]! < 0) components.HitCooldown[eid] = 0
    }
  }

  stepMovement(world, damage, dt)
  const hit = resolveContacts(world, damage)

  world.elapsed += dt
  if (hit) world.timeSinceHit = 0
  else world.timeSinceHit += dt

  checkZoneVictory(world)
  world.tick++
}

function accrueCharges(world: SimWorld): void {
  const { chargeInterval, chargeCap, fixedDt } = world.tuning
  for (const team of [0, 1] as const) {
    world.chargeProgress[team] += fixedDt
    while (world.chargeProgress[team] + 1e-8 >= chargeInterval) {
      world.chargeProgress[team] -= chargeInterval
      if (world.chargeProgress[team] < 0) world.chargeProgress[team] = 0
      if (chargeCap == null || world.charges[team] < chargeCap) {
        world.charges[team]++
      }
    }
  }
}

function applyPlayerSpawns(match: Match): void {
  const tick = match.world.tick
  for (const input of match.inputs) {
    if (input.applied || input.tick !== tick) continue
    input.applied = true
    spendCharge(match, 0, input.type)
  }
}

function applyComputerSpawns(match: Match): void {
  const { world } = match
  const typeIds = world.typeIds
  while (world.charges[1] > 0) {
    const type = match.opponent({
      team: 1,
      charges: world.charges[1],
      tick: world.tick,
      elapsed: world.elapsed,
      typeIds,
    })
    if (!type) break
    if (!spendCharge(match, 1, type)) break
  }
}

function spendCharge(match: Match, team: TeamId, type: TypeId): boolean {
  const { world } = match
  if (world.charges[team] <= 0) return false
  if (!world.types[type]) return false
  world.charges[team]--
  const radius = world.types[type]!.radius
  const pos = spawnPosition(world.tuning, team, radius, match.rng)
  const eid = spawnPuck(world, { x: pos.x, y: pos.y, team, type })
  world.components.State[eid] = PuckStates.Advancing
  world.components.TimeInState[eid] = 0
  world.spawned[team]++
  return true
}

function checkZoneVictory(world: SimWorld): void {
  if (world.finished) return
  let a = false
  let b = false
  for (const eid of aliveEntities(world as EcsWorld)) {
    const team = world.components.Team[eid] as TeamId
    const enemy: TeamId = team === 0 ? 1 : 0
    if (
      overlapsSpawnZone(
        world.tuning,
        enemy,
        world.components.Position.x[eid]!,
        world.components.Position.y[eid]!,
        world.components.Radius[eid]!,
      )
    ) {
      if (team === 0) a = true
      else b = true
    }
  }
  if (!a && !b) return
  world.finished = true
  if (a && b) {
    world.winner = null
    world.reason = 'draw'
  } else {
    world.winner = a ? 0 : 1
    world.reason = 'zone'
  }
}

export function countTeams(world: EcsWorld): { a: number; b: number } {
  let a = 0
  let b = 0
  for (const eid of aliveEntities(world)) {
    if (world.components.Team[eid] === 0) a++
    else b++
  }
  return { a, b }
}

export function countStatesByTeam(world: EcsWorld): {
  a: Record<PuckStateName, number>
  b: Record<PuckStateName, number>
} {
  const empty = (): Record<PuckStateName, number> => ({
    Hunting: 0,
    Engaged: 0,
    Retreating: 0,
    Regrouping: 0,
    Advancing: 0,
  })
  const a = empty()
  const b = empty()
  for (const eid of aliveEntities(world)) {
    const name = PUCK_STATE_NAMES[world.components.State[eid]! as PuckStateId]!
    if (world.components.Team[eid] === 0) a[name]++
    else b[name]++
  }
  return { a, b }
}

export function totalHp(world: EcsWorld): { a: number; b: number } {
  let a = 0
  let b = 0
  for (const eid of aliveEntities(world)) {
    if (world.components.Team[eid] === 0) a += world.components.Hp[eid]!
    else b += world.components.Hp[eid]!
  }
  return { a, b }
}

export function getMatchResult(match: Match): MatchResult | null {
  const { world } = match
  if (!world.finished || !world.reason) return null
  const counts = countTeams(world)
  return {
    winner: world.winner as TeamId | null,
    reason: world.reason,
    elapsed: world.elapsed,
    survivorsA: counts.a,
    survivorsB: counts.b,
    spawnedA: world.spawned[0],
    spawnedB: world.spawned[1],
    lostA: world.lost[0],
    lostB: world.lost[1],
    seed: match.seed,
    mode: match.mode,
  }
}

/** Run until finished. Returns the result. */
export function runHeadless(match: Match, maxSteps = 100_000): MatchResult {
  let steps = 0
  while (!match.world.finished && steps < maxSteps) {
    stepMatch(match)
    steps++
  }
  if (!match.world.finished) {
    match.world.finished = true
    match.world.reason = 'unfinished'
    match.world.winner = null
  }
  return getMatchResult(match)!
}

/** Snapshot of alive puck state for rendering / selection (no render imports). */
export type PuckSnapshot = {
  id: number
  x: number
  y: number
  radius: number
  hp: number
  maxHp: number
  team: TeamId
  type: string
  glyph: string
  vx: number
  vy: number
  state: PuckStateId
  stateName: PuckStateName
  timeInState: number
  targetId: number | null
}

export function snapshotPucks(match: Match): PuckSnapshot[] {
  const { world } = match
  const out: PuckSnapshot[] = []
  for (const eid of aliveEntities(world)) {
    const type = world.typeIds[world.components.TypeIndex[eid]!]!
    const state = world.components.State[eid]! as PuckStateId
    const target = world.components.TargetEid[eid]!
    out.push({
      id: eid,
      x: world.components.Position.x[eid]!,
      y: world.components.Position.y[eid]!,
      radius: world.components.Radius[eid]!,
      hp: world.components.Hp[eid]!,
      maxHp: world.components.MaxHp[eid]!,
      team: world.components.Team[eid] as TeamId,
      type,
      glyph: world.types[type]!.glyph,
      vx: world.components.Velocity.x[eid]!,
      vy: world.components.Velocity.y[eid]!,
      state,
      stateName: PUCK_STATE_NAMES[state]!,
      timeInState: world.components.TimeInState[eid]!,
      targetId: target >= 0 ? target : null,
    })
  }
  return out
}
