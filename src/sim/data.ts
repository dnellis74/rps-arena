import type {
  DamageMatrix,
  RosterData,
  TuningData,
  TypesData,
} from './types.ts'

import typesJson from '../../data/types.json'
import damageJson from '../../data/damage.json'
import rosterJson from '../../data/roster.json'
import tuningJson from '../../data/tuning.json'

export function loadGameData(): {
  types: TypesData
  damage: DamageMatrix
  roster: RosterData
  tuning: TuningData
} {
  return {
    types: typesJson as TypesData,
    damage: damageJson as DamageMatrix,
    roster: rosterJson as RosterData,
    tuning: tuningJson as TuningData,
  }
}
