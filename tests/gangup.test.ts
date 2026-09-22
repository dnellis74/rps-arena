import { describe, expect, it } from 'vitest'
import { gangUpThreshold, loadGameData } from '../src/sim/index.ts'

const { types, damage } = loadGameData()

describe('gang-up threshold', () => {
  it('derives threshold 3 for v0 symmetric matchups', () => {
    expect(gangUpThreshold('rock', 'paper', types, damage)).toBe(3)
    expect(gangUpThreshold('paper', 'scissors', types, damage)).toBe(3)
    expect(gangUpThreshold('scissors', 'rock', types, damage)).toBe(3)
  })

  it('requires strictly killing predator before a member dies', () => {
    // With 2 friends: ceil(6/(2*1))=3 hits to kill pred, ceil(6/2)=3 to kill friend → not before
    // So threshold cannot be 2.
    expect(gangUpThreshold('rock', 'paper', types, damage)).toBeGreaterThan(2)
  })
})
