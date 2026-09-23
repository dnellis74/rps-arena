import { describe, expect, it } from 'vitest'
import { createV0Behavior } from '../src/behavior/v0.ts'
import { loadGameData, type Observation } from '../src/sim/index.ts'

const data = loadGameData()
const behavior = createV0Behavior({
  types: data.types,
  damage: data.damage,
  tuning: data.tuning,
})

function baseObs(partial: Partial<Observation>): Observation {
  return {
    selfId: 0,
    type: 'rock',
    team: 0,
    x: 8,
    y: 12,
    hp: 12,
    maxHp: 12,
    prey: [],
    predators: [],
    sameTier: [],
    teammates: [],
    ...partial,
  }
}

const fullBand = { low: 8, high: 12, index: 2 }

describe('ahead press on near-even encounters', () => {
  it('engages predator when ahead and allies >= threshold-1', () => {
    // threshold is 4; near-even press at 3 (self + 2 rocks in gang radius).
    const obs = baseObs({
      hp: 12,
      teammates: [
        {
          id: 10,
          type: 'rock',
          team: 0,
          dx: 0.4,
          dy: 0,
          dist: 0.4,
          band: fullBand,
        },
        {
          id: 12,
          type: 'rock',
          team: 0,
          dx: 0,
          dy: 0.4,
          dist: 0.4,
          band: fullBand,
        },
        {
          id: 11,
          type: 'scissors',
          team: 0,
          dx: 5,
          dy: 0,
          dist: 5,
          band: fullBand,
        },
      ],
      predators: [
        {
          id: 2,
          type: 'paper',
          team: 1,
          dx: 0,
          dy: 2,
          dist: 2,
          band: fullBand,
        },
      ],
      prey: [],
      sameTier: [],
    })
    const dir = behavior(obs)
    expect(dir.y).toBeGreaterThan(0)
  })

  it('still flees a lone 1v1 when behind, even if predator is close', () => {
    const obs = baseObs({
      hp: 2,
      teammates: [],
      predators: [
        {
          id: 2,
          type: 'paper',
          team: 1,
          dx: 0,
          dy: 2,
          dist: 2,
          band: fullBand,
        },
      ],
      prey: [
        {
          id: 3,
          type: 'scissors',
          team: 1,
          dx: 6,
          dy: 0,
          dist: 6,
          band: fullBand,
        },
        {
          id: 4,
          type: 'scissors',
          team: 1,
          dx: 7,
          dy: 0,
          dist: 7,
          band: fullBand,
        },
        {
          id: 5,
          type: 'paper',
          team: 1,
          dx: 8,
          dy: 0,
          dist: 8,
          band: fullBand,
        },
      ],
    })
    const dir = behavior(obs)
    expect(dir.y).toBeLessThan(0)
  })
})
