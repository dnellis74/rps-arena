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

export type FieldBand = 'home' | 'mid' | 'attack'

type ZoneRules = {
  band: FieldBand
  huntRadius: number
  engageRadius: number
  threatEnterRadius: number
  threatExitRadius: number
  sameTierEngage: boolean
  gangUp: boolean
}

/** Horizontal third for this team. Home touches its spawn; attack is the far third. */
export function fieldBand(team: 0 | 1, y: number, arenaHeight: number): FieldBand {
  const u = arenaHeight > 0 ? y / arenaHeight : 0
  const low = u < 1 / 3
  const high = u > 2 / 3
  if (team === 0) {
    if (low) return 'home'
    if (high) return 'attack'
    return 'mid'
  }
  if (high) return 'home'
  if (low) return 'attack'
  return 'mid'
}

function zoneRules(
  tuning: EcsWorld['tuning'],
  band: FieldBand,
): ZoneRules {
  if (band !== 'attack') {
    return {
      band,
      huntRadius: tuning.huntRadius,
      engageRadius: tuning.engageRadius,
      threatEnterRadius: tuning.threatEnterRadius,
      threatExitRadius: tuning.threatExitRadius,
      sameTierEngage: true,
      gangUp: true,
    }
  }
  const close = tuning.attackZoneRadius
  const exit =
    tuning.threatEnterRadius > 0
      ? close * (tuning.threatExitRadius / tuning.threatEnterRadius)
      : close
  return {
    band,
    huntRadius: close,
    engageRadius: close,
    threatEnterRadius: close,
    threatExitRadius: exit,
    sameTierEngage: false,
    gangUp: false,
  }
}

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
  const band = fieldBand(obs.team, obs.y, world.tuning.arenaHeight)
  const rules = zoneRules(world.tuning, band)

  if (band === 'home') applyHome(world, eid, obs)
  else applyTransitions(world, eid, obs, damage, support, rules)

  const state = components.State[eid]! as PuckStateId
  components.TimeInState[eid]! += dt
  world.stateMetrics.timeInState[state]! += dt
  world.stateMetrics.puckSeconds += dt

  if (band === 'home') return homeIntent(world, eid, obs)
  const intent = intentForState(world, eid, obs, support, rules)
  if (band !== 'attack') return intent
  let move = intent
  if (components.State[eid] === PuckStates.Engaged) {
    const targetId = components.TargetEid[eid]!
    const engagedPrey = obs.prey.find((p) => p.id === targetId)
    if (!engagedPrey || engagedPrey.dist > rules.engageRadius) {
      move = advanceIntent(world, eid)
    }
  }
  const peer = nearestWithin(obs.sameTier, rules.threatEnterRadius)
  const prey = nearestWithin(obs.prey, rules.engageRadius)
  if (peer && !(prey && prey.dist <= peer.dist)) return avoidPeer(move, peer)
  return move
}

function applyHome(world: EcsWorld, eid: number, obs: Observation): void {
  const foes = foesInHome(obs, world.tuning.arenaHeight)
  if (foes.length === 0) {
    enter(world, eid, PuckStates.Advancing, -1, 'home:clear')
    return
  }
  enter(world, eid, PuckStates.Engaged, foes[0]!.id, 'home:contest')
}

function homeIntent(world: EcsWorld, eid: number, obs: Observation): Intent {
  const foes = foesInHome(obs, world.tuning.arenaHeight)
  const foe = foes[0]
  if (!foe) return advanceIntent(world, eid)
  return { x: foe.dx, y: foe.dy }
}

/** Enemies standing in this team's home third, nearest first. */
function foesInHome(obs: Observation, arenaHeight: number): SeenEntity[] {
  const foes: SeenEntity[] = []
  for (const list of [obs.prey, obs.predators, obs.sameTier]) {
    for (const e of list) {
      if (fieldBand(obs.team, obs.y + e.dy, arenaHeight) === 'home') foes.push(e)
    }
  }
  foes.sort((a, b) => a.dist - b.dist)
  return foes
}

function avoidPeer(intent: Intent, peer: SeenEntity): Intent {
  const il = Math.hypot(intent.x, intent.y) || 1
  const pl = Math.hypot(peer.dx, peer.dy) || 1
  return {
    x: intent.x / il - (1.5 * peer.dx) / pl,
    y: intent.y / il - (1.5 * peer.dy) / pl,
  }
}

function applyTransitions(
  world: EcsWorld,
  eid: number,
  obs: Observation,
  damage: DamageMatrix,
  support: SeenEntity | null,
  rules: ZoneRules,
): void {
  const { components, tuning, types } = world

  if (rules.band === 'attack') {
    const targetId = components.TargetEid[eid]!
    const stateNow = components.State[eid]! as PuckStateId
    if (stateNow === PuckStates.Engaged) {
      const prey = obs.prey.find((p) => p.id === targetId)
      if (!prey || prey.dist > rules.engageRadius) {
        enter(world, eid, PuckStates.Advancing, -1, 'attack:disengage')
        return
      }
    }
  }

  if (rules.gangUp) {
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
  }

  const state = components.State[eid]! as PuckStateId

  if (state === PuckStates.Hunting) {
    if (respondToPredator(world, eid, obs, 'hunting', rules)) return
    const engage = nearestEngageCandidate(obs, rules.engageRadius, rules.sameTierEngage)
    if (engage && canEnterEngaged(world, eid)) {
      enter(world, eid, PuckStates.Engaged, engage.id, 'hunting:engage')
      return
    }
    const prey = nearestWithin(obs.prey, rules.huntRadius)
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
    const pred = nearestWithin(obs.predators, rules.threatEnterRadius)
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
    if (!nearestPred || nearestPred.dist > rules.threatExitRadius) {
      enter(world, eid, PuckStates.Regrouping, -1, 'retreating:clear')
      return
    }
    return
  }

  if (state === PuckStates.Regrouping) {
    const pred = nearestWithin(obs.predators, rules.threatEnterRadius)
    if (pred) {
      enter(world, eid, PuckStates.Retreating, -1, 'regrouping:predator')
      return
    }
    const prey = obs.prey[0]
    if (
      prey &&
      prey.dist <= rules.engageRadius &&
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
    if (respondToPredator(world, eid, obs, 'advancing', rules)) return
    const prey = nearestWithin(obs.prey, rules.huntRadius)
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
  rules: ZoneRules,
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
    const closeness = 1 - Math.min(1, pred.dist / rules.threatEnterRadius)
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

  // Hunting: only prey inside the zone's hunt radius.
  const hunted = nearestWithin(obs.prey, rules.huntRadius)
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
  rules: ZoneRules,
): boolean {
  const pred = nearestWithin(obs.predators, rules.threatEnterRadius)
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
  sameTierEngage: boolean,
): SeenEntity | null {
  let best: SeenEntity | null = null
  for (const p of obs.prey) {
    if (p.dist > engageRadius) break
    if (!best || p.dist < best.dist) best = p
  }
  if (!sameTierEngage) return best
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
