import type { DamageMatrix, TypeId, TypesData } from './types.ts'

/** A preys on B when damage[A][B] > damage[B][A]. */
export function derivesPrey(damage: DamageMatrix, a: TypeId, b: TypeId): boolean {
  return (damage[a]?.[b] ?? 0) > (damage[b]?.[a] ?? 0)
}

export function isSameTier(damage: DamageMatrix, a: TypeId, b: TypeId): boolean {
  return (damage[a]?.[b] ?? 0) === (damage[b]?.[a] ?? 0)
}

export function getTypeIds(types: TypesData): TypeId[] {
  return Object.keys(types)
}

/**
 * Smallest group N whose combined damage kills the predator before the predator
 * kills one group member (simultaneous hits, equal cooldowns). Strictly before.
 */
export function gangUpThreshold(
  friendType: TypeId,
  predatorType: TypeId,
  types: TypesData,
  damage: DamageMatrix,
): number {
  const friendHp = types[friendType]!.hp
  const predHp = types[predatorType]!.hp
  const dmgOut = damage[friendType]?.[predatorType] ?? 0
  const dmgIn = damage[predatorType]?.[friendType] ?? 0
  if (dmgOut <= 0) return Number.POSITIVE_INFINITY
  if (dmgIn <= 0) return 1
  const hitsToKillFriend = Math.ceil(friendHp / dmgIn)
  for (let n = 1; n <= 64; n++) {
    const hitsToKillPred = Math.ceil(predHp / (n * dmgOut))
    if (hitsToKillPred < hitsToKillFriend) return n
  }
  return 64
}

/**
 * Map exact HP to a seen band. Band size is observerType.hpBandSize * enemy max HP.
 * Edges: band i covers [i*size, (i+1)*size); the top band includes maxHp.
 */
export function hpBand(
  hp: number,
  maxHp: number,
  bandFraction: number,
): { low: number; high: number; index: number } {
  const clamped = Math.max(0, Math.min(hp, maxHp))
  const bandCount = Math.max(1, Math.round(1 / bandFraction))
  const size = maxHp / bandCount
  let index = Math.floor(clamped / size)
  if (index >= bandCount) index = bandCount - 1
  if (clamped >= maxHp) index = bandCount - 1
  const low = index * size
  const high = index === bandCount - 1 ? maxHp : (index + 1) * size
  return { low, high, index }
}
