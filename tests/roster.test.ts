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

function talliesFor(
  match: ReturnType<typeof createMatch>,
  team: 0 | 1,
): Record<string, number> {
  const tallies: Record<string, number> = {}
  for (const p of snapshotPucks(match)) {
    if (p.team !== team) continue
    tallies[p.type] = (tallies[p.type] ?? 0) + 1
  }
  return tallies
}

describe('data-driven roster', () => {
  it('loads each side only from data/roster.json', () => {
    expect(rosterSideCount(data.roster.a)).toBe(
      (data.roster.a.rock ?? 0) +
        (data.roster.a.paper ?? 0) +
        (data.roster.a.scissors ?? 0),
    )
    expect(rosterSideCount(data.roster.b)).toBe(
      (data.roster.b.rock ?? 0) +
        (data.roster.b.paper ?? 0) +
        (data.roster.b.scissors ?? 0),
    )
    const match = createMatch({
      ...data,
      mode: 'damage',
      seed: 1,
      behavior,
    })
    const counts = countTeams(match.world)
    expect(counts.a).toBe(rosterSideCount(data.roster.a))
    expect(counts.b).toBe(rosterSideCount(data.roster.b))
  })

  it('spawns exact per-type counts from each side of the roster', () => {
    const roster = {
      a: { rock: 2, paper: 4, scissors: 1 },
      b: { rock: 2, paper: 4, scissors: 1 },
    }
    const match = createMatch({
      ...data,
      roster,
      mode: 'damage',
      seed: 2,
      behavior,
    })
    expect(countTeams(match.world)).toEqual({
      a: rosterSideCount(roster.a),
      b: rosterSideCount(roster.b),
    })
    expect(talliesFor(match, 0)).toEqual(roster.a)
    expect(talliesFor(match, 1)).toEqual(roster.b)
  })

  it('allows the two sides to differ', () => {
    const roster = {
      a: { rock: 5, paper: 0, scissors: 1 },
      b: { rock: 0, paper: 3, scissors: 2 },
    }
    const match = createMatch({
      ...data,
      roster,
      mode: 'damage',
      seed: 3,
      behavior,
    })
    expect(countTeams(match.world)).toEqual({ a: 6, b: 5 })
    expect(talliesFor(match, 0)).toEqual({ rock: 5, scissors: 1 })
    expect(talliesFor(match, 1)).toEqual({ paper: 3, scissors: 2 })
  })
})
