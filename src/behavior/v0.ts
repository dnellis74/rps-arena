import { gangUpThreshold } from '../sim/relationships.ts'
import { nearestCounterAlly } from '../sim/targeting.ts'
import type { BehaviorFn, Observation, SeenEntity } from '../sim/types.ts'
import type { DamageMatrix, TypesData, TuningData } from '../sim/types.ts'

export type BehaviorContext = {
  types: TypesData
  damage: DamageMatrix
  tuning: TuningData
}

/**
 * v0 hand-written behavior.
 * Priority: gang-up → (ahead + near-even: press) → flee (unless nearby prey
 * worth finishing) → seek → same-tier (HP advantage) → idle near teammates.
 *
 * Counter-ally link: when a predator is present, the nearest teammate that
 * preys on that predator's type is the support target (scissors→paper vs rock).
 * Flee blends away-from-predator with toward that ally. Seek gets a light bias
 * toward the same ally when a predator is still in threat range.
 *
 * Note on "keep clear": that steering only applies to same-tier enemies without an
 * HP advantage (spec §4 same-tier fight). Prey is always Seek/engage — close to
 * contact. Rock vs scissors is prey for rock, never keep-clear.
 */
export function createV0Behavior(ctx: BehaviorContext): BehaviorFn {
  const { types, damage, tuning } = ctx
  const {
    threatRadius,
    gangUpRadius,
    attackOverFlee,
    standoffDistance,
    counterAllyBias,
  } = tuning

  return (obs: Observation) => {
    const nearestPredator = nearestWithin(obs.predators, threatRadius)
    const prey = obs.prey[0]
    const counter = nearestPredator
      ? nearestCounterAlly(obs, nearestPredator.type, damage)
      : null

    if (nearestPredator) {
      const threshold = gangUpThreshold(
        obs.type,
        nearestPredator.type,
        types,
        damage,
      )
      const allies = countGang(
        obs,
        nearestPredator,
        gangUpRadius,
        damage,
      )
      if (allies >= threshold) {
        return dirToward(nearestPredator)
      }
      if (teamAhead(obs) && allies >= threshold - 1 && allies >= 1) {
        return dirToward(nearestPredator)
      }
      if (
        prey &&
        prey.dist <= nearestPredator.dist * attackOverFlee
      ) {
        return blendToward(dirToward(prey), counter, counterAllyBias * 0.35)
      }
      // Flee: away from predator, biased toward counter ally.
      const closeness = 1 - nearestPredator.dist / threatRadius
      const weight = 1 + closeness * closeness * 4
      const flee = {
        x: -nearestPredator.dx * weight,
        y: -nearestPredator.dy * weight,
      }
      return blendToward(flee, counter, counterAllyBias)
    }

    if (prey) return dirToward(prey)

    const same = obs.sameTier[0]
    if (same) {
      if (obs.hp > same.band.high) return dirToward(same)
      if (same.dist < standoffDistance) {
        return { x: -same.dx, y: -same.dy }
      }
    }

    if (obs.teammates.length > 0) {
      let sx = 0
      let sy = 0
      const n = Math.min(3, obs.teammates.length)
      for (let i = 0; i < n; i++) {
        sx += obs.teammates[i]!.dx
        sy += obs.teammates[i]!.dy
      }
      return { x: sx / n, y: sy / n }
    }

    return { x: 0, y: 0 }
  }
}

/** Mix base intent with a pull toward ally (ally vector scaled by bias). */
function blendToward(
  base: { x: number; y: number },
  ally: SeenEntity | null,
  bias: number,
): { x: number; y: number } {
  if (!ally || bias <= 0) return base
  const len = Math.hypot(ally.dx, ally.dy)
  if (len < 1e-8) return base
  const ux = ally.dx / len
  const uy = ally.dy / len
  return {
    x: base.x + ux * bias,
    y: base.y + uy * bias,
  }
}

function teamAhead(obs: Observation): boolean {
  let us = obs.hp
  for (const t of obs.teammates) {
    us += (t.band.low + t.band.high) / 2
  }
  let them = 0
  for (const e of obs.prey) them += (e.band.low + e.band.high) / 2
  for (const e of obs.predators) them += (e.band.low + e.band.high) / 2
  for (const e of obs.sameTier) them += (e.band.low + e.band.high) / 2
  return us > them
}

function nearestWithin(
  list: SeenEntity[],
  radius: number,
): SeenEntity | null {
  const e = list[0]
  if (!e || e.dist > radius) return null
  return e
}

function dirToward(e: SeenEntity): { x: number; y: number } {
  return { x: e.dx, y: e.dy }
}

function countGang(
  obs: Observation,
  predator: SeenEntity,
  gangUpRadius: number,
  damage: DamageMatrix,
): number {
  let count = 0
  if (predator.dist <= gangUpRadius) {
    count++
  }
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
