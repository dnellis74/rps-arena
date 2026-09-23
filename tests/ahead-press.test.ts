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
    hp: 6,
    maxHp: 6,
    prey: [],
    predators: [],
    sameTier: [],
    teammates: [],
    ...partial,
  }
}

const fullBand = { low: 4, high: 6, index: 2 }

describe('ahead press on near-even encounters', () => {
  it('engages predator when ahead and 2 allies make even odds (threshold-1)', () => {
    // Team ahead on HP; 2 rocks within gang radius of paper (even race, not yet 3).
    const obs = baseObs({
      hp: 6,
      teammates: [
        {
          id: 10,
          type: 'rock',
          team: 0,
          dx: 0.5,
          dy: 0,
          dist: 0.5,
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
      // Thin enemy side so we are ahead.
      prey: [],
      sameTier: [],
    })
    const dir = behavior(obs)
    // Engage paper (+y), not flee (−y).
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
    // Behind on HP, only 1 in gang → flee (−y).
    const dir = behavior(obs)
    expect(dir.y).toBeLessThan(0)
  })
})
