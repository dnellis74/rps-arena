import { derivesPrey } from './relationships.ts'
import type { DamageMatrix, Observation, SeenEntity, TypeId } from './types.ts'

/**
 * Nearest teammate that preys on `predatorType` (a counter to that predator).
 * Example: for predator rock, paper is a counter ally. Returns null if none.
 */
export function nearestCounterAlly(
  obs: Observation,
  predatorType: TypeId,
  damage: DamageMatrix,
): SeenEntity | null {
  let best: SeenEntity | null = null
  for (const mate of obs.teammates) {
    if (!derivesPrey(damage, mate.type, predatorType)) continue
    if (!best || mate.dist < best.dist) best = mate
  }
  return best
}

/**
 * Targeting link: given the nearest predator (any range), the nearest ally that
 * preys on that predator's type. Null if no predator or no such ally.
 * This is the offensive support link.
 */
export function counterAllyLink(
  obs: Observation,
  damage: DamageMatrix,
): { predator: SeenEntity; ally: SeenEntity } | null {
  const predator = obs.predators[0]
  if (!predator) return null
  const ally = nearestCounterAlly(obs, predator.type, damage)
  if (!ally) return null
  return { predator, ally }
}

/**
 * True when `selfType` preys on some type that preys on `allyType`.
 * Example: scissors defends rock, because scissors preys on paper and paper
 * preys on rock.
 */
export function canDefend(
  damage: DamageMatrix,
  selfType: TypeId,
  allyType: TypeId,
): boolean {
  for (const enemyType of Object.keys(damage)) {
    if (!derivesPrey(damage, selfType, enemyType)) continue
    if (derivesPrey(damage, enemyType, allyType)) return true
  }
  return false
}

/** Nearest teammate this puck can defend. Null if none. */
export function nearestDefendAlly(
  obs: Observation,
  damage: DamageMatrix,
): SeenEntity | null {
  let best: SeenEntity | null = null
  for (const mate of obs.teammates) {
    if (!canDefend(damage, obs.type, mate.type)) continue
    if (!best || mate.dist < best.dist) best = mate
  }
  return best
}

/**
 * Ally to steer toward. When `losing`, the defensive link wins over the
 * offensive one. If the preferred link is missing, use the other.
 */
export function supportAlly(
  obs: Observation,
  damage: DamageMatrix,
  losing: boolean,
): SeenEntity | null {
  const predator = obs.predators[0]
  const offensive = predator
    ? nearestCounterAlly(obs, predator.type, damage)
    : null
  const defensive = nearestDefendAlly(obs, damage)
  if (losing) return defensive ?? offensive
  return offensive ?? defensive
}
