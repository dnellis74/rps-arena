import type {
  DamageMatrix,
  RosterData,
  TuningData,
  TypeDef,
  TypeId,
  TypesData,
} from './types.ts'

import typesJson from '../../data/types.json'
import rosterJson from '../../data/roster.json'
import tuningJson from '../../data/tuning.json'

type TypeFileEntry = TypeDef & { damage: Record<TypeId, number> }

/** Split the combined type file into stats and the damage matrix. */
function splitTypes(file: Record<string, TypeFileEntry>): {
  types: TypesData
  damage: DamageMatrix
} {
  const types: TypesData = {}
  const damage: DamageMatrix = {}
  for (const [id, entry] of Object.entries(file)) {
    const { damage: row, ...stats } = entry
    types[id] = stats
    damage[id] = row
  }
  return { types, damage }
}

export function loadGameData(): {
  types: TypesData
  damage: DamageMatrix
  roster: RosterData
  tuning: TuningData
} {
  const { types, damage } = splitTypes(typesJson as Record<string, TypeFileEntry>)
  return {
    types,
    damage,
    roster: rosterJson as RosterData,
    tuning: tuningJson as TuningData,
  }
}
