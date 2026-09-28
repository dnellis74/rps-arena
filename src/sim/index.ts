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
  countStatesByTeam,
  totalHp,
  snapshotPucks,
} from './match.ts'
export type { Match, PuckSnapshot } from './match.ts'
export { loadGameData } from './data.ts'
export { buildObservation } from './perception.ts'
export { expandRoster, rosterSideCount } from './spawn.ts'
export {
  nearestCounterAlly,
  counterAllyLink,
  canDefend,
  nearestDefendAlly,
  supportAlly,
} from './targeting.ts'
export { stepPuckFsm, isTargetValid } from './fsm.ts'
export type {
  BehaviorFn,
  CombatMode,
  Observation,
  MatchResult,
  SeenEntity,
  HpBand,
  TypesData,
  DamageMatrix,
  SideRoster,
  RosterData,
  TuningData,
  TeamId,
  SimConfig,
  PuckStateId,
  PuckStateName,
} from './types.ts'
export { PuckStates, PUCK_STATE_NAMES } from './types.ts'
