import { describe, expect, it } from 'vitest'
import { createV0Behavior } from '../src/behavior/v0.ts'
import {
  createMatch,
  loadGameData,
  snapshotPucks,
  stepMatch,
} from '../src/sim/index.ts'
import { spawnPuck } from '../src/sim/world.ts'

const data = loadGameData()
const behavior = createV0Behavior({
  types: data.types,
  damage: data.damage,
  tuning: data.tuning,
})

/**
 * Regression: two rocks cornering a scissors must close to contact and kill.
 * "Keep clear" is same-tier-only (spec §4); rock→scissors is Seek/engage.
 */
describe('cornered prey engagement', () => {
  it('two rocks finish a scissors pinned in the corner', () => {
    const match = createMatch({
      ...data,
      mode: 'damage',
      seed: 1,
      behavior,
      roster: {
        a: { rock: 0, paper: 0, scissors: 0 },
        b: { rock: 0, paper: 0, scissors: 0 },
      },
    })

    const scissorsId = spawnPuck(match.world, {
      x: 0.6,
      y: 0.6,
      team: 1,
      type: 'scissors',
    })
    spawnPuck(match.world, { x: 2.2, y: 1.0, team: 0, type: 'rock' })
    spawnPuck(match.world, { x: 1.0, y: 2.2, team: 0, type: 'rock' })

    // Contact range is 1.0; pre-fix stall sat at ~1.33 with no HP loss.
    const steps = Math.ceil(8 / data.tuning.fixedDt)
    for (let i = 0; i < steps; i++) {
      stepMatch(match)
      if (!snapshotPucks(match).some((p) => p.id === scissorsId)) break
    }

    const scissors = snapshotPucks(match).find((p) => p.id === scissorsId)
    expect(scissors).toBeUndefined()
  })
})
