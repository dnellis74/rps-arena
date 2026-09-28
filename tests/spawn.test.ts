import { describe, expect, it } from 'vitest'
import {
  createMatch,
  loadGameData,
  queueSpawn,
  recordedInputs,
  runHeadless,
  snapshotPucks,
  spawnZoneCenter,
  stepMatch,
  type MatchResult,
  type SpawnInput,
} from '../src/sim/index.ts'
import { PuckStates } from '../src/sim/types.ts'
import { spawnPuck } from '../src/sim/world.ts'

const data = loadGameData()

function quietMatch(seed = 1, extra: { chargeCap?: number | null } = {}) {
  return createMatch({
    ...data,
    tuning: { ...data.tuning, ...extra },
    mode: 'damage',
    seed,
    opponent: () => null,
  })
}

describe('spawn charges', () => {
  it('accumulates at chargeInterval and banks with no cap', () => {
    const match = quietMatch()
    expect(match.world.charges[0]).toBe(0)
    const interval = data.tuning.chargeInterval
    const dt = data.tuning.fixedDt
    const stepsPer = Math.ceil(interval / dt)
    for (let i = 0; i < stepsPer; i++) stepMatch(match)
    expect(match.world.charges[0]).toBe(1)
    expect(match.world.elapsed).toBeGreaterThanOrEqual(interval - dt)
    expect(match.world.elapsed).toBeLessThan(interval + dt)
    for (let i = 0; i < stepsPer * 3; i++) stepMatch(match)
    expect(match.world.charges[0]).toBe(4)
  })

  it('respects chargeCap when set', () => {
    const match = quietMatch(1, { chargeCap: 2 })
    const stepsPer = Math.ceil(data.tuning.chargeInterval / data.tuning.fixedDt)
    for (let i = 0; i < stepsPer * 5; i++) stepMatch(match)
    expect(match.world.charges[0]).toBe(2)
  })

  it('spends a charge to spawn, and does nothing at zero', () => {
    const match = quietMatch()
    expect(queueSpawn(match, 'rock')).toBe(false)
    stepMatch(match)
    expect(snapshotPucks(match).filter((p) => p.team === 0)).toHaveLength(0)

    match.world.charges[0] = 1
    expect(queueSpawn(match, 'paper')).toBe(true)
    stepMatch(match)
    const ours = snapshotPucks(match).filter((p) => p.team === 0)
    expect(ours).toHaveLength(1)
    expect(ours[0]!.type).toBe('paper')
    expect(ours[0]!.state).toBe(PuckStates.Advancing)
    expect(match.world.charges[0]).toBe(0)
    expect(match.world.spawned[0]).toBe(1)
  })

  it('gives same-tick spawns distinct offsets', () => {
    const match = quietMatch()
    match.world.charges[0] = 3
    expect(queueSpawn(match, 'rock')).toBe(true)
    expect(queueSpawn(match, 'paper')).toBe(true)
    expect(queueSpawn(match, 'scissors')).toBe(true)
    stepMatch(match)
    const pts = snapshotPucks(match)
      .filter((p) => p.team === 0)
      .map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`)
    expect(new Set(pts).size).toBe(3)
  })
})

describe('zone victory', () => {
  it('triggers on overlap and not before', () => {
    const match = quietMatch()
    const self = spawnPuck(match.world, {
      x: 24,
      y: 30,
      team: 0,
      type: 'rock',
    })
    stepMatch(match)
    expect(match.world.finished).toBe(false)

    const zone = spawnZoneCenter(data.tuning, 1)
    match.world.components.Position.x[self] = zone.x
    match.world.components.Position.y[self] = zone.y
    stepMatch(match)
    expect(match.world.finished).toBe(true)
    expect(match.world.winner).toBe(0)
    expect(match.world.reason).toBe('zone')
  })

  it('a lone unit advances and wins', () => {
    const match = quietMatch(4)
    const stepsPer = Math.ceil(data.tuning.chargeInterval / data.tuning.fixedDt)
    for (let i = 0; i < stepsPer; i++) stepMatch(match)
    expect(match.world.charges[0]).toBeGreaterThanOrEqual(1)
    expect(queueSpawn(match, 'rock')).toBe(true)
    const result = runHeadless(match, 20_000)
    expect(result.reason).toBe('zone')
    expect(result.winner).toBe(0)
    expect(result.spawnedA).toBe(1)
    expect(result.elapsed).toBeGreaterThan(1)
  })
})

describe('computer opponent', () => {
  it('spends every charge immediately', () => {
    const match = createMatch({
      ...data,
      mode: 'damage',
      seed: 3,
    })
    const stepsPer = Math.ceil(data.tuning.chargeInterval / data.tuning.fixedDt)
    for (let n = 1; n <= 4; n++) {
      for (let i = 0; i < stepsPer; i++) stepMatch(match)
      expect(match.world.charges[1]).toBe(0)
      expect(match.world.spawned[1]).toBe(n)
    }
  })
})

describe('replay determinism', () => {
  it('same seed and player inputs give the same result', () => {
    const inputs: SpawnInput[] = [
      { tick: 180, type: 'rock' },
      { tick: 360, type: 'paper' },
      { tick: 540, type: 'scissors' },
    ]
    const run = (): MatchResult => {
      const match = createMatch({
        ...data,
        mode: 'damage',
        seed: 99,
        inputs,
      })
      return runHeadless(match, 8_000)
    }
    const a = run()
    const b = run()
    expect(a).toEqual(b)
    expect(recordedInputs(createMatch({
      ...data,
      mode: 'damage',
      seed: 99,
      inputs,
    }))).toEqual(inputs)
  })
})
