import { gangUpThreshold } from './relationships.ts'
import { supportAlly } from './targeting.ts'
import {
  PuckStates,
  type DamageMatrix,
  type Observation,
  type PuckStateId,
  type SeenEntity,
} from './types.ts'
import { enemySpawnZoneCenter } from './spawn.ts'
import { recordTransition, type EcsWorld } from './world.ts'

export type Intent = { x: number; y: number }

/**
 * Advance one puck's state machine and return its movement intent.
 * Rendering must never call this — only the sim step.
 */
export function stepPuckFsm(
  world: EcsWorld,
  eid: number,
  obs: Observation,
  damage: DamageMatrix,
  dt: number,
): Intent {
  const { components } = world
  if (components.ReengageLockout[eid]! > 0) {
    components.ReengageLockout[eid]! -= dt
    if (components.ReengageLockout[eid]! < 0) components.ReengageLockout[eid] = 0
  }
  if (components.StateChangeCooldown[eid]! > 0) {
    components.StateChangeCooldown[eid]! -= dt
    if (components.StateChangeCooldown[eid]! < 0) {
      components.StateChangeCooldown[eid] = 0
    }
  }

  updateTeamLead(world, eid, obs)

  const losing = components.TeamLead[eid]! < 0
  const support = supportAlly(obs, damage, losing)

  applyTransitions(world, eid, obs, damage, support)

  const state = components.State[eid]! as PuckStateId
  components.TimeInState[eid]! += dt
  world.stateMetrics.timeInState[state]! += dt
  world.stateMetrics.puckSeconds += dt

  return intentForState(world, eid, obs, support)
}

function applyTransitions(
  world: EcsWorld,
  eid: number,
  obs: Observation,
  damage: DamageMatrix,
  support: SeenEntity | null,
): void {
  const { components, tuning, types } = world

  const gang = gangUpTarget(
    obs,
    damage,
    types,
    tuning,
    components.TeamLead[eid]! > 0,
  )
  if (gang) {
    enter(world, eid, PuckStates.Engaged, gang.id, 'any:gangup')
    return
  }

  const state = components.State[eid]! as PuckStateId

  if (state === PuckStates.Hunting) {
    if (respondToPredator(world, eid, obs, 'hunting')) return
    const engage = nearestEngageCandidate(obs, tuning.engageRadius)
    if (engage && canEnterEngaged(world, eid)) {
      enter(world, eid, PuckStates.Engaged, engage.id, 'hunting:engage')
      return
    }
    const prey = nearestWithin(obs.prey, tuning.huntRadius)
    if (!prey) {
      enter(world, eid, PuckStates.Advancing, -1, 'hunting:noPrey')
    }
    return
  }

  if (state === PuckStates.Engaged) {
    const targetId = components.TargetEid[eid]!
    if (!isTargetValid(world, eid, targetId)) {
      enter(world, eid, PuckStates.Regrouping, -1, 'engaged:targetDead')
      return
    }
    if (obs.hp <= obs.maxHp * tuning.retreatHpFraction) {
      enter(world, eid, PuckStates.Retreating, -1, 'engaged:lowHp')
      return
    }
    if (components.TimeInState[eid]! >= tuning.engageMaxTime) {
      enter(world, eid, PuckStates.Regrouping, -1, 'engaged:timeout')
      return
    }
    const pred = nearestWithin(obs.predators, tuning.threatEnterRadius)
    if (pred && pred.id !== targetId) {
      const prey = obs.prey[0]
      if (!finishPreyApplies(pred, prey, tuning.attackOverFlee)) {
        enter(world, eid, PuckStates.Retreating, -1, 'engaged:predator')
        return
      }
    }
    return
  }

  if (state === PuckStates.Retreating) {
    if (support && support.dist <= tuning.supportAllyRadius) {
      enter(world, eid, PuckStates.Regrouping, -1, 'retreating:support')
      return
    }
    const nearestPred = obs.predators[0]
    if (!nearestPred || nearestPred.dist > tuning.threatExitRadius) {
      enter(world, eid, PuckStates.Regrouping, -1, 'retreating:clear')
      return
    }
    return
  }

  if (state === PuckStates.Regrouping) {
    const pred = nearestWithin(obs.predators, tuning.threatEnterRadius)
    if (pred) {
      enter(world, eid, PuckStates.Retreating, -1, 'regrouping:predator')
      return
    }
    const prey = obs.prey[0]
    if (
      prey &&
      prey.dist <= tuning.engageRadius &&
      canEnterEngaged(world, eid)
    ) {
      enter(world, eid, PuckStates.Engaged, prey.id, 'regrouping:engage')
      return
    }
    if (components.TimeInState[eid]! >= tuning.regroupMaxTime) {
      enter(world, eid, PuckStates.Advancing, -1, 'regrouping:timeout')
    }
    return
  }

  if (state === PuckStates.Advancing) {
    if (respondToPredator(world, eid, obs, 'advancing')) return
    const prey = nearestWithin(obs.prey, tuning.huntRadius)
    if (prey) {
      enter(world, eid, PuckStates.Hunting, -1, 'advancing:prey')
    }
  }
}

function intentForState(
  world: EcsWorld,
  eid: number,
  obs: Observation,
  support: SeenEntity | null,
): Intent {
  const { components, tuning } = world
  const state = components.State[eid]! as PuckStateId

  if (state === PuckStates.Engaged) {
    const targetId = components.TargetEid[eid]!
    const seen = findSeen(obs, targetId)
    if (seen) return { x: seen.dx, y: seen.dy }
    if (isTargetValid(world, eid, targetId)) {
      return {
        x: components.Position.x[targetId]! - components.Position.x[eid]!,
        y: components.Position.y[targetId]! - components.Position.y[eid]!,
      }
    }
    return { x: 0, y: 0 }
  }

  if (state === PuckStates.Retreating) {
    const pred = obs.predators[0]
    if (!pred) {
      if (support) return { x: support.dx, y: support.dy }
      return { x: 0, y: 0 }
    }
    const closeness = 1 - Math.min(1, pred.dist / tuning.threatEnterRadius)
    const weight = 1 + closeness * closeness * 4
    const flee = { x: -pred.dx * weight, y: -pred.dy * weight }
    return blendToward(flee, support, tuning.counterAllyBias)
  }

  if (state === PuckStates.Regrouping) {
    const ally = obs.teammates[0]
    const prey = obs.prey[0]
    if (ally && prey) {
      return ally.dist <= prey.dist
        ? { x: ally.dx, y: ally.dy }
        : { x: prey.dx, y: prey.dy }
    }
    if (ally) return { x: ally.dx, y: ally.dy }
    if (prey) return { x: prey.dx, y: prey.dy }
    return { x: 0, y: 0 }
  }

  if (state === PuckStates.Advancing) return advanceIntent(world, eid)

  // Hunting: only prey inside huntRadius.
  const hunted = nearestWithin(obs.prey, tuning.huntRadius)
  if (hunted) return { x: hunted.dx, y: hunted.dy }
  return advanceIntent(world, eid)
}

function advanceIntent(world: EcsWorld, eid: number): Intent {
  const { components, tuning } = world
  const team = components.Team[eid] as 0 | 1
  const zone = enemySpawnZoneCenter(tuning, team)
  return {
    x: zone.x - components.Position.x[eid]!,
    y: zone.y - components.Position.y[eid]!,
  }
}

/** Predator response shared by Hunting and Advancing. Returns true if it handled the tick. */
function respondToPredator(
  world: EcsWorld,
  eid: number,
  obs: Observation,
  from: 'hunting' | 'advancing',
): boolean {
  const pred = nearestWithin(obs.predators, world.tuning.threatEnterRadius)
  if (!pred) return false
  const prey = obs.prey[0]
  if (finishPreyApplies(pred, prey, world.tuning.attackOverFlee)) {
    enter(world, eid, PuckStates.Engaged, prey!.id, `${from}:finishPrey`)
    return true
  }
  enter(world, eid, PuckStates.Retreating, -1, `${from}:predator`)
  return true
}

function enter(
  world: EcsWorld,
  eid: number,
  next: PuckStateId,
  targetEid: number,
  transition: string,
): void {
  const { components, tuning } = world
  const prev = components.State[eid]! as PuckStateId
  if (prev === next && components.TargetEid[eid]! === targetEid) return

  const stateChanged = prev !== next
  if (stateChanged && components.StateChangeCooldown[eid]! > 0) return

  if (prev === PuckStates.Retreating && next !== PuckStates.Retreating) {
    components.ReengageLockout[eid] = tuning.reengageLockout
  }

  components.State[eid] = next
  components.TargetEid[eid] = targetEid
  if (stateChanged) {
    components.TimeInState[eid] = 0
    const rate = Math.max(0.001, tuning.maxStateChangesPerSecond)
    components.StateChangeCooldown[eid] = 1 / rate
    world.stateMetrics.changes++
    recordTransition(world, transition)
  }
}

function canEnterEngaged(world: EcsWorld, eid: number): boolean {
  return world.components.ReengageLockout[eid]! <= 0
}

export function isTargetValid(
  world: EcsWorld,
  selfEid: number,
  targetEid: number,
): boolean {
  if (targetEid < 0) return false
  const { components } = world
  if (!components.Alive[targetEid]) return false
  if (components.Team[targetEid] === components.Team[selfEid]) return false
  return true
}

function finishPreyApplies(
  predator: SeenEntity,
  prey: SeenEntity | undefined,
  attackOverFlee: number,
): boolean {
  return !!prey && prey.dist <= predator.dist * attackOverFlee
}

function nearestEngageCandidate(
  obs: Observation,
  engageRadius: number,
): SeenEntity | null {
  let best: SeenEntity | null = null
  for (const p of obs.prey) {
    if (p.dist > engageRadius) break
    if (!best || p.dist < best.dist) best = p
  }
  for (const s of obs.sameTier) {
    if (s.dist > engageRadius) break
    if (obs.hp <= s.band.high) continue
    if (!best || s.dist < best.dist) best = s
  }
  return best
}

function gangUpTarget(
  obs: Observation,
  damage: DamageMatrix,
  types: EcsWorld['types'],
  tuning: EcsWorld['tuning'],
  ahead: boolean,
): SeenEntity | null {
  const predator = nearestWithin(obs.predators, tuning.threatEnterRadius)
  if (!predator) return null
  const threshold = gangUpThreshold(obs.type, predator.type, types, damage)
  const allies = countGang(obs, predator, tuning.gangUpRadius, damage)
  if (allies >= threshold) return predator
  if (ahead && allies >= threshold - 1 && allies >= 1) return predator
  return null
}

function countGang(
  obs: Observation,
  predator: SeenEntity,
  gangUpRadius: number,
  damage: DamageMatrix,
): number {
  let count = 0
  if (predator.dist <= gangUpRadius) count++
  for (const mate of obs.teammates) {
    const predPreysOnMate =
      (damage[predator.type]?.[mate.type] ?? 0) >
      (damage[mate.type]?.[predator.type] ?? 0)
    if (!predPreysOnMate) continue
    const mdx = predator.dx - mate.dx
    const mdy = predator.dy - mate.dy
    if (Math.hypot(mdx, mdy) <= gangUpRadius) count++
  }
  return count
}

function updateTeamLead(world: EcsWorld, eid: number, obs: Observation): void {
  const { components, tuning } = world
  let us = obs.hp
  for (const t of obs.teammates) us += (t.band.low + t.band.high) / 2
  let them = 0
  for (const e of obs.prey) them += (e.band.low + e.band.high) / 2
  for (const e of obs.predators) them += (e.band.low + e.band.high) / 2
  for (const e of obs.sameTier) them += (e.band.low + e.band.high) / 2

  let totalMax = components.MaxHp[eid]!
  for (const mate of obs.teammates) {
    if (components.Alive[mate.id]) totalMax += components.MaxHp[mate.id]!
  }
  for (const list of [obs.prey, obs.predators, obs.sameTier]) {
    for (const e of list) {
      if (components.Alive[e.id]) totalMax += components.MaxHp[e.id]!
    }
  }
  const margin = totalMax * tuning.teamLeadHysteresis
  const diff = us - them
  if (diff > margin) components.TeamLead[eid] = 1
  else if (diff < -margin) components.TeamLead[eid] = -1
}

function nearestWithin(
  list: SeenEntity[],
  radius: number,
): SeenEntity | null {
  const e = list[0]
  if (!e || e.dist > radius) return null
  return e
}

function findSeen(obs: Observation, id: number): SeenEntity | null {
  for (const list of [obs.prey, obs.predators, obs.sameTier, obs.teammates]) {
    for (const e of list) if (e.id === id) return e
  }
  return null
}

function blendToward(
  base: Intent,
  ally: SeenEntity | null,
  bias: number,
): Intent {
  if (!ally || bias <= 0) return base
  const len = Math.hypot(ally.dx, ally.dy)
  if (len < 1e-8) return base
  return {
    x: base.x + (ally.dx / len) * bias,
    y: base.y + (ally.dy / len) * bias,
  }
}
