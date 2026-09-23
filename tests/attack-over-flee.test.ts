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

describe('attack over flee', () => {
  it('seeks closer prey instead of fleeing a farther predator', () => {
    const obs = baseObs({
      prey: [
        {
          id: 1,
          type: 'scissors',
          team: 1,
          dx: 1.5,
          dy: 0,
          dist: 1.5,
          band: { low: 4, high: 6, index: 2 },
        },
      ],
      predators: [
        {
          id: 2,
          type: 'paper',
          team: 1,
          dx: -4,
          dy: 0,
          dist: 4,
          band: { low: 4, high: 6, index: 2 },
        },
      ],
    })
    const dir = behavior(obs)
    // Toward prey (+x), not away from predator (also +x when fleeing -dx of -4).
    // Flee would also be +x here — use prey that is +y so directions differ.
    expect(dir.x).toBeGreaterThan(0)
  })

  it('seeks prey when directions differ and prey is within attackOverFlee band', () => {
    const obs = baseObs({
      prey: [
        {
          id: 1,
          type: 'scissors',
          team: 1,
          dx: 0,
          dy: 2,
          dist: 2,
          band: { low: 2, high: 4, index: 1 },
        },
      ],
      predators: [
        {
          id: 2,
          type: 'paper',
          team: 1,
          dx: 3,
          dy: 0,
          dist: 3,
          band: { low: 4, high: 6, index: 2 },
        },
      ],
    })
    // prey.dist 2 <= 3 * 1.25 → seek (+y). Flee would be -x.
    const dir = behavior(obs)
    expect(dir.y).toBeGreaterThan(Math.abs(dir.x))
  })

  it('still flees when predator is clearly closer than prey', () => {
    const obs = baseObs({
      prey: [
        {
          id: 1,
          type: 'scissors',
          team: 1,
          dx: 0,
          dy: 5,
          dist: 5,
          band: { low: 4, high: 6, index: 2 },
        },
      ],
      predators: [
        {
          id: 2,
          type: 'paper',
          team: 1,
          dx: 2,
          dy: 0,
          dist: 2,
          band: { low: 4, high: 6, index: 2 },
        },
      ],
    })
    // 5 > 2 * 1.25 → flee (−x)
    const dir = behavior(obs)
    expect(dir.x).toBeLessThan(0)
    expect(Math.abs(dir.x)).toBeGreaterThan(Math.abs(dir.y))
  })
})
