import { describe, expect, it } from 'vitest'
import {
  canDefend,
  counterAllyLink,
  loadGameData,
  nearestCounterAlly,
  nearestDefendAlly,
  supportAlly,
  type Observation,
  type SeenEntity,
} from '../src/sim/index.ts'

const data = loadGameData()
const band = { low: 4, high: 6, index: 2 }
const lowBand = { low: 0, high: 4, index: 0 }
const highBand = { low: 8, high: 12, index: 2 }

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

function mate(
  id: number,
  type: string,
  dx: number,
  b = lowBand,
): SeenEntity {
  return {
    id,
    type,
    team: 0,
    dx,
    dy: 0,
    dist: Math.abs(dx),
    band: b,
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
        mate(2, 'rock', 1),
        mate(3, 'paper', 4),
        mate(4, 'paper', 2),
      ],
    })
    const ally = nearestCounterAlly(obs, 'rock', data.damage)
    expect(ally?.id).toBe(4)
    expect(ally?.type).toBe('paper')
    const link = counterAllyLink(obs, data.damage)
    expect(link?.ally.id).toBe(4)
    expect(link?.predator.type).toBe('rock')
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
      teammates: [mate(2, 'scissors', 1)],
    })
    expect(counterAllyLink(obs, data.damage)).toBeNull()
  })
})

describe('defend-ally targeting', () => {
  it('scissors defends rock, because scissors kills the paper that chases rock', () => {
    expect(canDefend(data.damage, 'scissors', 'rock')).toBe(true)
    expect(canDefend(data.damage, 'rock', 'paper')).toBe(true)
    expect(canDefend(data.damage, 'paper', 'scissors')).toBe(true)
    expect(canDefend(data.damage, 'scissors', 'paper')).toBe(false)
    expect(canDefend(data.damage, 'scissors', 'scissors')).toBe(false)
  })

  it('picks the nearest ally this puck can defend', () => {
    const obs = scissorsObs({
      teammates: [
        mate(2, 'paper', 1),
        mate(3, 'rock', 4),
        mate(4, 'rock', 2),
        mate(5, 'scissors', 0.5),
      ],
    })
    const ally = nearestDefendAlly(obs, data.damage)
    expect(ally?.id).toBe(4)
    expect(ally?.type).toBe('rock')
  })

  it('when behind, prefers the ally it can defend rather than its counter', () => {
    const obs = scissorsObs({
      hp: 2,
      maxHp: 12,
      predators: [
        {
          id: 1,
          type: 'rock',
          team: 1,
          dx: 0,
          dy: -2,
          dist: 2,
          band: highBand,
        },
      ],
      teammates: [mate(3, 'paper', 5), mate(4, 'rock', -5)],
    })
    expect(supportAlly(obs, data.damage, true)?.id).toBe(4)
  })

  it('when ahead, still prefers the offensive counter ally', () => {
    const obs = scissorsObs({
      hp: 12,
      maxHp: 12,
      predators: [
        {
          id: 1,
          type: 'rock',
          team: 1,
          dx: 0,
          dy: -2,
          dist: 2,
          band: lowBand,
        },
      ],
      teammates: [
        mate(3, 'paper', 5, highBand),
        mate(4, 'rock', -5, highBand),
      ],
    })
    expect(supportAlly(obs, data.damage, false)?.id).toBe(3)
  })
})
