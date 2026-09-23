import { describe, expect, it } from 'vitest'
import { createV0Behavior } from '../src/behavior/v0.ts'
import {
  counterAllyLink,
  loadGameData,
  nearestCounterAlly,
  type Observation,
} from '../src/sim/index.ts'

const data = loadGameData()
const behavior = createV0Behavior({
  types: data.types,
  damage: data.damage,
  tuning: data.tuning,
})

const band = { low: 4, high: 6, index: 2 }

function scissorsObs(partial: Partial<Observation> = {}): Observation {
  return {
    selfId: 0,
    type: 'scissors',
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

describe('counter-ally targeting', () => {
  it('picks nearest ally that preys on the predator type (scissors→paper vs rock)', () => {
    const obs = scissorsObs({
      predators: [
        {
          id: 1,
          type: 'rock',
          team: 1,
          dx: 0,
          dy: -3,
          dist: 3,
          band,
        },
      ],
      teammates: [
        {
          id: 2,
          type: 'rock',
          team: 0,
          dx: 1,
          dy: 0,
          dist: 1,
          band,
        },
        {
          id: 3,
          type: 'paper',
          team: 0,
          dx: 4,
          dy: 0,
          dist: 4,
          band,
        },
        {
          id: 4,
          type: 'paper',
          team: 0,
          dx: 2,
          dy: 0,
          dist: 2,
          band,
        },
      ],
    })
    const ally = nearestCounterAlly(obs, 'rock', data.damage)
    expect(ally?.id).toBe(4)
    expect(ally?.type).toBe('paper')
    const link = counterAllyLink(obs, data.damage)
    expect(link?.ally.id).toBe(4)
    expect(link?.predator.type).toBe('rock')
  })

  it('biases flee toward the counter ally, not pure away-from-predator', () => {
    const obs = scissorsObs({
      predators: [
        {
          id: 1,
          type: 'rock',
          team: 1,
          dx: 0,
          dy: -2,
          dist: 2,
          band,
        },
      ],
      teammates: [
        {
          id: 3,
          type: 'paper',
          team: 0,
          dx: 5,
          dy: 0,
          dist: 5,
          band,
        },
      ],
    })
    const dir = behavior(obs)
    // Pure flee from rock at (0,-2) is +y. Counter ally is +x → flee should gain +x.
    expect(dir.y).toBeGreaterThan(0)
    expect(dir.x).toBeGreaterThan(0)
  })

  it('returns null link when no counter ally exists', () => {
    const obs = scissorsObs({
      predators: [
        {
          id: 1,
          type: 'rock',
          team: 1,
          dx: 2,
          dy: 0,
          dist: 2,
          band,
        },
      ],
      teammates: [
        {
          id: 2,
          type: 'scissors',
          team: 0,
          dx: 1,
          dy: 0,
          dist: 1,
          band,
        },
      ],
    })
    expect(counterAllyLink(obs, data.damage)).toBeNull()
  })
})
