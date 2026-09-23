import { resolveContacts } from './combat.ts'
import { stepMovement } from './movement.ts'
import { SeededRng } from './rng.ts'
import { expandRoster, rosterSideCount, spawnTeam } from './spawn.ts'
import type {
  BehaviorFn,
  CombatMode,
  DamageMatrix,
  MatchResult,
  RosterData,
  TeamId,
  TuningData,
  TypesData,
} from './types.ts'
import {
  aliveEntities,
  createSimWorld,
  type EcsWorld,
  type SimWorld,
} from './world.ts'

export type Match = {
  world: EcsWorld
  damage: DamageMatrix
  behavior: BehaviorFn
  seed: number
  mode: CombatMode
  rng: SeededRng
}

export function createMatch(opts: {
  types: TypesData
  damage: DamageMatrix
  roster: RosterData
  tuning: TuningData
  mode: CombatMode
  seed: number
  behavior: BehaviorFn
}): Match {
  const rng = new SeededRng(opts.seed)
  // Capacity from roster data only: both sides + spare for convert churn.
  const countA = rosterSideCount(opts.roster.a)
  const countB = rosterSideCount(opts.roster.b)
  const world = createSimWorld(
    opts.types,
    opts.tuning,
    opts.mode,
    countA + countB + 32,
  ) as EcsWorld
  const rosterA = expandRoster(opts.roster.a, rng)
  const rosterB = expandRoster(opts.roster.b, rng)
  spawnTeam(world, 0, rosterA, opts.tuning, rng)
  spawnTeam(world, 1, rosterB, opts.tuning, rng)
  return {
    world,
    damage: opts.damage,
    behavior: opts.behavior,
    seed: opts.seed,
    mode: opts.mode,
    rng,
  }
}

/** One fixed-timestep simulation step. */
export function stepMatch(match: Match): void {
  const { world, damage, behavior } = match
  if (world.finished) return

  const dt = world.tuning.fixedDt
  const { components } = world

  for (const eid of aliveEntities(world)) {
    if (components.HitCooldown[eid]! > 0) {
      components.HitCooldown[eid]! -= dt
      if (components.HitCooldown[eid]! < 0) components.HitCooldown[eid] = 0
    }
  }

  stepMovement(world, damage, behavior, dt)
  const hit = resolveContacts(world, damage)

  world.elapsed += dt
  if (hit) world.timeSinceHit = 0
  else world.timeSinceHit += dt

  checkEnd(world)
}

function checkEnd(world: SimWorld): void {
  if (world.finished) return
  const counts = countTeams(world as EcsWorld)
  if (counts.a === 0 || counts.b === 0) {
    world.finished = true
    world.reason = 'elimination'
    if (counts.a === 0 && counts.b === 0) world.winner = null
    else world.winner = counts.a > 0 ? 0 : 1
    return
  }
  if (world.timeSinceHit >= world.tuning.stalemateTimeout) {
    world.finished = true
    world.reason = 'stalemate'
    const hp = totalHp(world as EcsWorld)
    if (hp.a > hp.b) world.winner = 0
    else if (hp.b > hp.a) world.winner = 1
    else world.winner = null
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
  const hp = totalHp(world)
  return {
    winner: world.winner as TeamId | null,
    reason: world.reason,
    elapsed: world.elapsed,
    survivorsA: counts.a,
    survivorsB: counts.b,
    totalHpA: hp.a,
    totalHpB: hp.b,
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
    // Safety: force stalemate by HP if we hit the cap.
    match.world.finished = true
    match.world.reason = 'stalemate'
    const hp = totalHp(match.world)
    if (hp.a > hp.b) match.world.winner = 0
    else if (hp.b > hp.a) match.world.winner = 1
    else match.world.winner = null
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
}

export function snapshotPucks(match: Match): PuckSnapshot[] {
  const { world } = match
  const out: PuckSnapshot[] = []
  for (const eid of aliveEntities(world)) {
    const type = world.typeIds[world.components.TypeIndex[eid]!]!
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
    })
  }
  return out
}
