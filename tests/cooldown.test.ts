import { describe, expect, it } from 'vitest'
import {
  createMatch,
  loadGameData,
  stepMatch,
} from '../src/sim/index.ts'
import { spawnPuck } from '../src/sim/world.ts'

const data = loadGameData()
describe('hit cooldown', () => {
  it('enforces per-attacker cooldown between damage hits', () => {
    const match = createMatch({
      ...data,
      mode: 'damage',
      seed: 7,
      opponent: () => null,
    })

    const rockId = spawnPuck(match.world, {
      x: 8,
      y: 12,
      team: 0,
      type: 'rock',
    })
    const paperId = spawnPuck(match.world, {
      x: 8.2,
      y: 12,
      team: 1,
      type: 'paper',
    })
    const a = { id: rockId }
    const b = { id: paperId }
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
