import { describe, expect, it } from 'vitest'
import {
  createMatch,
  loadGameData,
  PUCK_STATE_NAMES,
  runHeadless,
  type CombatMode,
} from '../src/sim/index.ts'

const data = loadGameData()

/** Small roster so batch stays practical. */
const roster = {
  a: { rock: 4, paper: 4, scissors: 4 },
  b: { rock: 4, paper: 4, scissors: 4 },
}

const EXPECTED_TRANSITIONS = [
  'any:gangup',
  'hunting:predator',
  'hunting:finishPrey',
  'hunting:engage',
  'engaged:targetDead',
  'engaged:lowHp',
  'engaged:timeout',
  'engaged:predator',
  'retreating:support',
  'retreating:clear',
  'regrouping:predator',
  'regrouping:engage',
  'regrouping:timeout',
] as const

type BatchStats = {
  mode: CombatMode
  winsA: number
  winsB: number
  draws: number
  stalemates: number
  meanLength: number
  stateChangesPerPuckPerMinute: number
  timeShare: Record<string, number>
  transitions: Record<string, number>
}

function runBatch(mode: CombatMode, n: number): BatchStats {
  let winsA = 0
  let winsB = 0
  let draws = 0
  let stalemates = 0
  let totalLength = 0
  let totalChanges = 0
  let totalPuckSeconds = 0
  const timeInState = [0, 0, 0, 0]
  const transitions: Record<string, number> = {}

  for (let i = 0; i < n; i++) {
    const seed = (i * 2654435761) >>> 0
    const match = createMatch({
      ...data,
      roster,
      mode,
      seed,
    })
    const result = runHeadless(match)
    if (result.winner === 0) winsA++
    else if (result.winner === 1) winsB++
    else draws++
    if (result.reason === 'stalemate') stalemates++
    totalLength += result.elapsed

    const m = match.world.stateMetrics
    totalChanges += m.changes
    totalPuckSeconds += m.puckSeconds
    for (let s = 0; s < 4; s++) timeInState[s]! += m.timeInState[s]!
    for (const [k, v] of Object.entries(m.transitions)) {
      transitions[k] = (transitions[k] ?? 0) + v
    }
  }

  const minutes = totalPuckSeconds / 60
  const timeShare: Record<string, number> = {}
  const totalTime = timeInState.reduce((a, b) => a + b, 0) || 1
  for (let s = 0; s < 4; s++) {
    timeShare[PUCK_STATE_NAMES[s]!] = timeInState[s]! / totalTime
  }

  return {
    mode,
    winsA,
    winsB,
    draws,
    stalemates,
    meanLength: totalLength / n,
    stateChangesPerPuckPerMinute: minutes > 0 ? totalChanges / minutes : 0,
    timeShare,
    transitions,
  }
}

describe('batch matches', () => {
  const modes: CombatMode[] = ['damage', 'instant_kill', 'convert']

  for (const mode of modes) {
    it(`runs 100 headless matches for ${mode}`, () => {
      const stats = runBatch(mode, 100)
      console.log(
        JSON.stringify(
          {
            mode: stats.mode,
            winRateA: stats.winsA / 100,
            winRateB: stats.winsB / 100,
            drawRate: stats.draws / 100,
            stalemateRate: stats.stalemates / 100,
            meanMatchLength: Number(stats.meanLength.toFixed(2)),
            stateChangesPerPuckPerMinute: Number(
              stats.stateChangesPerPuckPerMinute.toFixed(2),
            ),
            timeShare: Object.fromEntries(
              Object.entries(stats.timeShare).map(([k, v]) => [
                k,
                Number(v.toFixed(4)),
              ]),
            ),
            transitions: stats.transitions,
            neverFired: EXPECTED_TRANSITIONS.filter(
              (t) => !stats.transitions[t],
            ),
          },
          null,
          2,
        ),
      )

      expect(stats.winsA + stats.winsB + stats.draws).toBe(100)
      expect(Math.abs(stats.winsA - stats.winsB)).toBeLessThanOrEqual(40)
      expect(stats.meanLength).toBeGreaterThan(0)
      expect(stats.stateChangesPerPuckPerMinute).toBeGreaterThan(0)
    })
  }
})
