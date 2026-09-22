import { describe, expect, it } from 'vitest'
import { hpBand, loadGameData } from '../src/sim/index.ts'

const { types } = loadGameData()
const bandFrac = types.rock!.hpBandSize
const maxHp = types.rock!.hp

describe('HP band perception', () => {
  it('splits max HP into three bands for 1/3 band size', () => {
    const low = hpBand(1, maxHp, bandFrac)
    const mid = hpBand(3, maxHp, bandFrac)
    const high = hpBand(5, maxHp, bandFrac)
    expect(low.index).toBe(0)
    expect(mid.index).toBe(1)
    expect(high.index).toBe(2)
  })

  it('places band edges in the higher band only at exact upper exclusive boundaries', () => {
    // size = 2 for max 6. Bands: [0,2), [2,4), [4,6]
    const at0 = hpBand(0, maxHp, bandFrac)
    const justBelow2 = hpBand(1.999, maxHp, bandFrac)
    const at2 = hpBand(2, maxHp, bandFrac)
    const at4 = hpBand(4, maxHp, bandFrac)
    const at6 = hpBand(6, maxHp, bandFrac)

    expect(at0.index).toBe(0)
    expect(at0.low).toBe(0)
    expect(at0.high).toBe(2)

    expect(justBelow2.index).toBe(0)

    expect(at2.index).toBe(1)
    expect(at2.low).toBe(2)
    expect(at2.high).toBe(4)

    expect(at4.index).toBe(2)
    expect(at4.low).toBe(4)
    expect(at4.high).toBe(6)

    expect(at6.index).toBe(2)
    expect(at6.high).toBe(6)
  })
})
