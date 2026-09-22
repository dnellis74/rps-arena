import { describe, expect, it } from 'vitest'
import { derivesPrey, isSameTier, loadGameData } from '../src/sim/index.ts'

const { damage } = loadGameData()

describe('relationship derivation', () => {
  it('derives classic RPS prey relationships from the matrix', () => {
    expect(derivesPrey(damage, 'rock', 'scissors')).toBe(true)
    expect(derivesPrey(damage, 'scissors', 'paper')).toBe(true)
    expect(derivesPrey(damage, 'paper', 'rock')).toBe(true)

    expect(derivesPrey(damage, 'scissors', 'rock')).toBe(false)
    expect(derivesPrey(damage, 'paper', 'scissors')).toBe(false)
    expect(derivesPrey(damage, 'rock', 'paper')).toBe(false)
  })

  it('treats equal matrix cells as same-tier', () => {
    expect(isSameTier(damage, 'rock', 'rock')).toBe(true)
    expect(isSameTier(damage, 'paper', 'paper')).toBe(true)
    expect(isSameTier(damage, 'scissors', 'scissors')).toBe(true)
    expect(isSameTier(damage, 'rock', 'paper')).toBe(false)
  })
})
