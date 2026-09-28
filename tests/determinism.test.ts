import { describe, expect, it } from 'vitest'
import {
  createMatch,
  loadGameData,
  runHeadless,
} from '../src/sim/index.ts'
import type { CombatMode, MatchResult } from '../src/sim/index.ts'

const data = loadGameData()
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

/** Small fixed roster so the check stays fast regardless of playtest counts. */
const roster = {
  a: { rock: 3, paper: 3, scissors: 3 },
  b: { rock: 3, paper: 3, scissors: 3 },
}

function runOnce(seed: number, mode: CombatMode): MatchResult {
  const match = createMatch({
    ...data,
    roster,
    mode,
    seed,
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
