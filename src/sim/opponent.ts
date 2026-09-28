import type { SeededRng } from './rng.ts'
import type { TeamId, TypeId } from './types.ts'

/** What an opponent sees when deciding whether to spend a charge. */
export type SpawnChoiceState = {
  team: TeamId
  charges: number
  tick: number
  elapsed: number
  typeIds: readonly TypeId[]
}

/** Null means do not spend a charge. */
export type SpawnChooser = (state: SpawnChoiceState) => TypeId | null

/** Spends every charge on a uniform random type. Never returns null while charges remain. */
export function randomOpponent(rng: SeededRng): SpawnChooser {
  return (state) => {
    if (state.charges <= 0 || state.typeIds.length === 0) return null
    const i = Math.floor(rng.next() * state.typeIds.length)
    return state.typeIds[i]!
  }
}
