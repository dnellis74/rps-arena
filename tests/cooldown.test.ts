import { describe, expect, it } from 'vitest'
import { createV0Behavior } from '../src/behavior/v0.ts'
import {
  createMatch,
  loadGameData,
  stepMatch,
  snapshotPucks,
} from '../src/sim/index.ts'
import { killPuck } from '../src/sim/world.ts'

const data = loadGameData()
const behavior = createV0Behavior({
  types: data.types,
  damage: data.damage,
  tuning: data.tuning,
})

describe('hit cooldown', () => {
  it('enforces per-attacker cooldown between damage hits', () => {
    const match = createMatch({
      ...data,
      mode: 'damage',
      seed: 7,
      behavior,
      roster: {
        a: { rock: 1, paper: 1, scissors: 0 },
        b: { rock: 1, paper: 1, scissors: 0 },
      },
    })

    // Keep one rock (team A) and one paper (team B); remove the rest.
    const all = snapshotPucks(match)
    const rock = all.find((p) => p.type === 'rock' && p.team === 0)
    const paper = all.find((p) => p.type === 'paper' && p.team === 1)
    expect(rock).toBeTruthy()
    expect(paper).toBeTruthy()
    for (const p of all) {
      if (p.id !== rock!.id && p.id !== paper!.id) killPuck(match.world, p.id)
    }

    const a = rock!
    const b = paper!
    match.world.components.Position.x[a.id] = 8
    match.world.components.Position.y[a.id] = 12
    match.world.components.Position.x[b.id] = 8.2
    match.world.components.Position.y[b.id] = 12
    match.world.components.Speed[a.id] = 0
    match.world.components.Speed[b.id] = 0

    const hpBeforeA = match.world.components.Hp[a.id]!
    const hpBeforeB = match.world.components.Hp[b.id]!

    stepMatch(match)
    const afterFirstA = match.world.components.Hp[a.id]!
    const afterFirstB = match.world.components.Hp[b.id]!
    expect(afterFirstA + afterFirstB).toBeLessThan(hpBeforeA + hpBeforeB)

    const hpAfterHitA = afterFirstA
    const hpAfterHitB = afterFirstB

    const dt = data.tuning.fixedDt
    const stepsHalf = Math.floor(0.4 / dt)
    for (let i = 0; i < stepsHalf; i++) stepMatch(match)
    expect(match.world.components.Hp[a.id]).toBe(hpAfterHitA)
    expect(match.world.components.Hp[b.id]).toBe(hpAfterHitB)

    const stepsRest = Math.ceil(0.5 / dt) + 2
    for (let i = 0; i < stepsRest; i++) stepMatch(match)
    expect(
      match.world.components.Hp[a.id]! + match.world.components.Hp[b.id]!,
    ).toBeLessThan(hpAfterHitA + hpAfterHitB)
  })
})
