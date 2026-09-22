import { gangUpThreshold } from '../sim/relationships.ts'
import type { BehaviorFn, Observation, SeenEntity } from '../sim/types.ts'
import type { DamageMatrix, TypesData, TuningData } from '../sim/types.ts'

export type BehaviorContext = {
  types: TypesData
  damage: DamageMatrix
  tuning: TuningData
}

/**
 * v0 hand-written behavior.
 * Priority: gang-up → flee → seek → same-tier (HP advantage) → idle near teammates.
 */
export function createV0Behavior(ctx: BehaviorContext): BehaviorFn {
  const { types, damage, tuning } = ctx
  const { threatRadius, gangUpRadius } = tuning

  return (obs: Observation) => {
    const nearestPredator = nearestWithin(obs.predators, threatRadius)

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
      // Flee: weight rises sharply as predator gets closer.
      const closeness = 1 - nearestPredator.dist / threatRadius
      const weight = 1 + closeness * closeness * 4
      return {
        x: -nearestPredator.dx * weight,
        y: -nearestPredator.dy * weight,
      }
    }

    const prey = obs.prey[0]
    if (prey) return dirToward(prey)

    const same = obs.sameTier[0]
    if (same) {
      if (obs.hp > same.band.high) return dirToward(same)
      // Keep clear of equal/stronger same-tier.
      if (same.dist < threatRadius) {
        return { x: -same.dx, y: -same.dy }
      }
    }

    // Idle: hold near teammates (centroid of nearest few).
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

/** Friendly pucks (self included) that this predator preys on, within gang-up radius of it. */
function countGang(
  obs: Observation,
  predator: SeenEntity,
  gangUpRadius: number,
  damage: DamageMatrix,
): number {
  let count = 0
  // Self: relative to predator is -predator.dx/dy from self, dist = predator.dist
  if (predator.dist <= gangUpRadius) {
    // Predator preys on self by definition (it's in predators list).
    count++
  }
  for (const mate of obs.teammates) {
    // Does predator prey on mate?
    const predPreysOnMate =
      (damage[predator.type]?.[mate.type] ?? 0) >
      (damage[mate.type]?.[predator.type] ?? 0)
    if (!predPreysOnMate) continue
    // Mate position relative to observer: (mate.dx, mate.dy)
    // Predator relative to observer: (predator.dx, predator.dy)
    // Dist mate→predator:
    const mdx = predator.dx - mate.dx
    const mdy = predator.dy - mate.dy
    if (Math.hypot(mdx, mdy) <= gangUpRadius) count++
  }
  return count
}
