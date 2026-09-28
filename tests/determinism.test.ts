import { describe, expect, it } from 'vitest'
import { createMatch, loadGameData, runHeadless } from '../src/sim/index.ts'
import type { CombatMode, MatchResult, SpawnInput } from '../src/sim/index.ts'

const data = loadGameData()

const inputs: SpawnInput[] = [
  { tick: 180, type: 'rock' },
  { tick: 360, type: 'scissors' },
]

function fingerprint(result: MatchResult): string {
  return [
    result.winner,
    result.reason,
    result.elapsed.toFixed(6),
    result.spawnedA,
    result.spawnedB,
    result.lostA,
    result.lostB,
    result.survivorsA,
    result.survivorsB,
  ].join('|')
}

function runOnce(seed: number, mode: CombatMode): MatchResult {
  const match = createMatch({
    ...data,
    mode,
    seed,
    inputs,
    opponent: () => null,
  })
  return runHeadless(match, 20_000)
}

describe('determinism', () => {
  const modes: CombatMode[] = ['damage', 'instant_kill', 'convert']

  for (const mode of modes) {
    it(`same seed, inputs, and mode (${mode}) yield identical results`, () => {
      const a = runOnce(42_424_242, mode)
      const b = runOnce(42_424_242, mode)
      expect(fingerprint(a)).toBe(fingerprint(b))
      expect(a.reason).toBe('zone')
    })
  }
})
