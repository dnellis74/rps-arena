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
 * Priority: gang-up → (ahead + near-even: press) → flee (unless nearby prey
 * worth finishing) → seek → same-tier (HP advantage) → idle near teammates.
 *
 * Note on "keep clear": that steering only applies to same-tier enemies without an
 * HP advantage (spec §4 same-tier fight). Prey is always Seek/engage — close to
 * contact. Rock vs scissors is prey for rock, never keep-clear.
 *
 * Attack vs run: if prey is about as close as (or closer than) the nearest
 * predator — within attackOverFlee × predator distance — Seek instead of Flee
 * so easy kills aren't abandoned to distant chasers.
 *
 * Lead press: when this team is ahead on estimated HP, do not flee a near-even
 * local fight (gang allies within one of the kill-before-killed threshold) —
 * press the encounter instead.
 */
export function createV0Behavior(ctx: BehaviorContext): BehaviorFn {
  const { types, damage, tuning } = ctx
  const { threatRadius, gangUpRadius, attackOverFlee, standoffDistance } =
    tuning

  return (obs: Observation) => {
    const nearestPredator = nearestWithin(obs.predators, threatRadius)
    const prey = obs.prey[0]

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
      // Ahead + near-even local odds → press instead of flee.
      // threshold-1 is the simultaneous even race (v0: 2 vs predator).
      if (teamAhead(obs) && allies >= threshold - 1 && allies >= 1) {
        return dirToward(nearestPredator)
      }
      // Prefer finishing nearby prey over fleeing a farther predator.
      if (
        prey &&
        prey.dist <= nearestPredator.dist * attackOverFlee
      ) {
        return dirToward(prey)
      }
      // Flee: weight rises sharply as predator gets closer.
      const closeness = 1 - nearestPredator.dist / threatRadius
      const weight = 1 + closeness * closeness * 4
      return {
        x: -nearestPredator.dx * weight,
        y: -nearestPredator.dy * weight,
      }
    }

    if (prey) return dirToward(prey)

    const same = obs.sameTier[0]
    if (same) {
      if (obs.hp > same.band.high) return dirToward(same)
      // Keep clear only inside standoff (~2 circle widths), not full threat radius.
      if (same.dist < standoffDistance) {
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

/** Rough team HP from exact self HP + seen band midpoints. */
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

/** Friendly pucks (self included) that this predator preys on, within gang-up radius of it. */
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
