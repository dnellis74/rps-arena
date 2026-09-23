/**
 * Headless simulation API. Must not import render or UI modules.
 */
export { SeededRng, randomSeed } from './rng.ts'
export {
  derivesPrey,
  isSameTier,
  gangUpThreshold,
  hpBand,
} from './relationships.ts'
export {
  createMatch,
  stepMatch,
  runHeadless,
  getMatchResult,
  countTeams,
  totalHp,
  snapshotPucks,
} from './match.ts'
export type { Match, PuckSnapshot } from './match.ts'
export { loadGameData } from './data.ts'
export { buildObservation } from './perception.ts'
export { expandRoster, rosterSideCount } from './spawn.ts'
export type {
  BehaviorFn,
  CombatMode,
  Observation,
  MatchResult,
  SeenEntity,
  HpBand,
  TypesData,
  DamageMatrix,
  RosterData,
  TuningData,
  TeamId,
  SimConfig,
} from './types.ts'
