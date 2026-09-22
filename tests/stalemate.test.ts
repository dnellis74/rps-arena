import { describe, expect, it } from 'vitest'
import { createV0Behavior } from '../src/behavior/v0.ts'
import {
  createMatch,
  getMatchResult,
  loadGameData,
  snapshotPucks,
  stepMatch,
} from '../src/sim/index.ts'

const data = loadGameData()
const behavior = createV0Behavior({
  types: data.types,
  damage: data.damage,
  tuning: data.tuning,
})

describe('stalemate timer', () => {
  it('ends the match after stalemateTimeout with no hits', () => {
    // Only rocks vs rocks: force no hits by freezing in place.
    const match = createMatch({
      ...data,
      mode: 'damage',
      seed: 99,
      behavior,
      roster: { rock: 2, paper: 0, scissors: 0 },
    })

    for (const p of snapshotPucks(match)) {
      match.world.components.Speed[p.id] = 0
    }

    const timeout = data.tuning.stalemateTimeout
    const dt = data.tuning.fixedDt
    const steps = Math.ceil(timeout / dt) + 2

    for (let i = 0; i < steps; i++) stepMatch(match)

    expect(match.world.finished).toBe(true)
    expect(match.world.reason).toBe('stalemate')
    const result = getMatchResult(match)
    expect(result).not.toBeNull()
    expect(result!.elapsed).toBeGreaterThanOrEqual(timeout)
  })
})
