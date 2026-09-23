import { describe, expect, it } from 'vitest'
import { hpBand, loadGameData } from '../src/sim/index.ts'

const { types } = loadGameData()
const bandFrac = types.rock!.hpBandSize
const maxHp = types.rock!.hp

describe('HP band perception', () => {
  it('splits max HP into three bands for 1/3 band size', () => {
    const low = hpBand(1, maxHp, bandFrac)
    const mid = hpBand(5, maxHp, bandFrac)
    const high = hpBand(10, maxHp, bandFrac)
    expect(low.index).toBe(0)
    expect(mid.index).toBe(1)
    expect(high.index).toBe(2)
  })

  it('places band edges in the higher band only at exact upper exclusive boundaries', () => {
    // size = 4 for max 12. Bands: [0,4), [4,8), [8,12]
    const at0 = hpBand(0, maxHp, bandFrac)
    const justBelow4 = hpBand(3.999, maxHp, bandFrac)
    const at4 = hpBand(4, maxHp, bandFrac)
    const at8 = hpBand(8, maxHp, bandFrac)
    const at12 = hpBand(12, maxHp, bandFrac)

    expect(at0.index).toBe(0)
    expect(at0.low).toBe(0)
    expect(at0.high).toBe(4)

    expect(justBelow4.index).toBe(0)

    expect(at4.index).toBe(1)
    expect(at4.low).toBe(4)
    expect(at4.high).toBe(8)

    expect(at8.index).toBe(2)
    expect(at8.low).toBe(8)
    expect(at8.high).toBe(12)

    expect(at12.index).toBe(2)
    expect(at12.high).toBe(12)
  })
})
