import { describe, expect, it } from 'vitest'
import { createV0Behavior } from '../src/behavior/v0.ts'
import {
  countTeams,
  createMatch,
  loadGameData,
  rosterSideCount,
  snapshotPucks,
} from '../src/sim/index.ts'

const data = loadGameData()
const behavior = createV0Behavior({
  types: data.types,
  damage: data.damage,
  tuning: data.tuning,
})

describe('data-driven roster', () => {
  it('loads side size only from data/roster.json defaults', () => {
    expect(rosterSideCount(data.roster)).toBe(
      (data.roster.rock ?? 0) +
        (data.roster.paper ?? 0) +
        (data.roster.scissors ?? 0),
    )
    const match = createMatch({
      ...data,
      mode: 'damage',
      seed: 1,
      behavior,
    })
    const counts = countTeams(match.world)
    const side = rosterSideCount(data.roster)
    expect(counts.a).toBe(side)
    expect(counts.b).toBe(side)
  })

  it('spawns exact per-type counts from the roster argument (not hardcoded)', () => {
    const roster = { rock: 2, paper: 4, scissors: 1 }
    const match = createMatch({
      ...data,
      roster,
      mode: 'damage',
      seed: 2,
      behavior,
    })
    const side = rosterSideCount(roster)
    expect(countTeams(match.world)).toEqual({ a: side, b: side })

    for (const team of [0, 1] as const) {
      const tallies: Record<string, number> = {}
      for (const p of snapshotPucks(match)) {
        if (p.team !== team) continue
        tallies[p.type] = (tallies[p.type] ?? 0) + 1
      }
      expect(tallies).toEqual({ rock: 2, paper: 4, scissors: 1 })
    }
  })
})
