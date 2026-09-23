import { describe, expect, it } from 'vitest'
import { gangUpThreshold, loadGameData } from '../src/sim/index.ts'

const { types, damage } = loadGameData()

describe('gang-up threshold', () => {
  it('derives threshold 4 for current HP/damage matchups', () => {
    // Friend deals 1 to predator, predator deals 3 to friend; HP 12.
    // ceil(12/3)=4 hits to kill friend; need ceil(12/N) < 4 → N >= 4.
    expect(gangUpThreshold('rock', 'paper', types, damage)).toBe(4)
    expect(gangUpThreshold('paper', 'scissors', types, damage)).toBe(4)
    expect(gangUpThreshold('scissors', 'rock', types, damage)).toBe(4)
  })

  it('requires strictly killing predator before a member dies', () => {
    expect(gangUpThreshold('rock', 'paper', types, damage)).toBeGreaterThan(3)
  })
})
