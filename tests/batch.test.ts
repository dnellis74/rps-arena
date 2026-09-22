import { describe, expect, it } from 'vitest'
import { createV0Behavior } from '../src/behavior/v0.ts'
import {
  createMatch,
  loadGameData,
  runHeadless,
  type CombatMode,
} from '../src/sim/index.ts'

const data = loadGameData()
const behavior = createV0Behavior({
  types: data.types,
  damage: data.damage,
  tuning: data.tuning,
})

type BatchStats = {
  mode: CombatMode
  winsA: number
  winsB: number
  draws: number
  stalemates: number
  meanLength: number
}

function runBatch(mode: CombatMode, n: number): BatchStats {
  let winsA = 0
  let winsB = 0
  let draws = 0
  let stalemates = 0
  let totalLength = 0

  for (let i = 0; i < n; i++) {
    const seed = (i * 2654435761) >>> 0
    const match = createMatch({
      ...data,
      mode,
      seed,
      behavior,
    })
    const result = runHeadless(match)
    if (result.winner === 0) winsA++
    else if (result.winner === 1) winsB++
    else draws++
    if (result.reason === 'stalemate') stalemates++
    totalLength += result.elapsed
  }

  return {
    mode,
    winsA,
    winsB,
    draws,
    stalemates,
    meanLength: totalLength / n,
  }
}

describe('batch matches', () => {
  const modes: CombatMode[] = ['damage', 'instant_kill', 'convert']

  for (const mode of modes) {
    it(`runs 100 headless matches for ${mode} with near-even sides`, () => {
      const stats = runBatch(mode, 100)
      // Report in test output
      console.log(
        JSON.stringify(
          {
            mode: stats.mode,
            winRateA: stats.winsA / 100,
            winRateB: stats.winsB / 100,
            drawRate: stats.draws / 100,
            stalemateRate: stats.stalemates / 100,
            meanMatchLength: Number(stats.meanLength.toFixed(2)),
          },
          null,
          2,
        ),
      )

      expect(stats.winsA + stats.winsB + stats.draws).toBe(100)
      // Symmetric data → side win rates should be close to even.
      // Allow generous slack for stochastic variance and mode-specific dynamics.
      expect(Math.abs(stats.winsA - stats.winsB)).toBeLessThanOrEqual(35)
      expect(stats.meanLength).toBeGreaterThan(0)
    })
  }
})
