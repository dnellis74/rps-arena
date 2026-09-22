import { describe, expect, it } from 'vitest'
import { createV0Behavior } from '../src/behavior/v0.ts'
import {
  createMatch,
  loadGameData,
  runHeadless,
} from '../src/sim/index.ts'
import type { CombatMode, MatchResult } from '../src/sim/index.ts'

const data = loadGameData()
const behavior = createV0Behavior({
  types: data.types,
  damage: data.damage,
  tuning: data.tuning,
})

function fingerprint(result: MatchResult): string {
  return [
    result.winner,
    result.reason,
    result.elapsed.toFixed(6),
    result.survivorsA,
    result.survivorsB,
    result.totalHpA.toFixed(6),
    result.totalHpB.toFixed(6),
  ].join('|')
}

function runOnce(seed: number, mode: CombatMode): MatchResult {
  const match = createMatch({
    ...data,
    mode,
    seed,
    behavior,
  })
  return runHeadless(match)
}

describe('determinism', () => {
  const modes: CombatMode[] = ['damage', 'instant_kill', 'convert']

  for (const mode of modes) {
    it(`same seed+mode (${mode}) yields identical results`, () => {
      const seed = 42_424_242
      const a = runOnce(seed, mode)
      const b = runOnce(seed, mode)
      expect(fingerprint(a)).toBe(fingerprint(b))
    })
  }
})
