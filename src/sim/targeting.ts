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
