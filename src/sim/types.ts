export type TypeId = string

/** Body shape drawn for this type. Unknown values are drawn as a circle. */
export type PuckShape = 'circle' | 'square' | 'triangle'

export function puckShape(raw: string | undefined): PuckShape {
  if (raw === 'circle' || raw === 'square' || raw === 'triangle') return raw
  return 'circle'
}

export type TypeDef = {
  glyph: string
  shape: PuckShape
  hp: number
  speed: number
  radius: number
  /** Fraction of max HP per perception band. */
  hpBandSize: number
  /** Fraction of max HP after convert into this type. */
  convertHp: number
}

export type TypesData = Record<TypeId, TypeDef>
export type DamageMatrix = Record<TypeId, Record<TypeId, number>>
export type TuningData = {
  arenaWidth: number
  arenaHeight: number
  gangUpRadius: number
  hitCooldown: number
  separationRadius: number
  wallMargin: number
  weights: {
    intent: number
    separation: number
    walls: number
  }
  spawnJitter: number
  fixedDt: number
  /**
   * When a predator is in threat range, still engage prey if nearest prey
   * distance is at most predatorDist * attackOverFlee.
   */
  attackOverFlee: number
  /**
   * Preferred keep-clear range for same-tier without HP advantage (legacy;
   * hunting no longer uses active keep-clear steering).
   */
  standoffDistance: number
  /** Short-side puck diameters at max zoom-in (camera; render-only). */
  maxZoomInPucksAcross: number
  /**
   * When retreating, blend this much of the unit direction toward the support
   * ally into flee intent.
   */
  counterAllyBias: number
  /** Distance at which prey / valid same-tier can pull a puck into Engaged. */
  engageRadius: number
  /** Max seconds to stay Engaged before regrouping. */
  engageMaxTime: number
  /** Predator distance that triggers retreat / gang-up enter checks. */
  threatEnterRadius: number
  /** Predator distance beyond which retreat ends. */
  threatExitRadius: number
  /** Distance to support ally that ends retreat. */
  supportAllyRadius: number
  /** Seconds after leaving Retreating before Engaged is allowed (except gang-up). */
  reengageLockout: number
  /** Max seconds in Regrouping before returning to Hunting. */
  regroupMaxTime: number
  /** Own HP at or below this fraction of max HP forces Retreating from Engaged. */
  retreatHpFraction: number
  /**
   * Fraction of combined seen max HP: team lead flag flips only when the
   * seen-HP difference exceeds this margin.
   */
  teamLeadHysteresis: number
  /** Cap on how often a puck may change state (retarget within a state free). */
  maxStateChangesPerSecond: number
  /** Hunting tracks prey only inside this distance. */
  huntRadius: number
  /**
   * In the attack third, hunt, engage, and threat distances collapse to this.
   * Same-tier enemies inside it are avoided. Prey beyond it is ignored.
   */
  attackZoneRadius: number
  /** Radius of each side's spawn-zone circle. */
  spawnZoneRadius: number
  /** Seconds between charge gains. */
  chargeInterval: number
  /** Max banked charges. Null means no cap. */
  chargeCap: number | null
  /** Spawn disk radius around the zone center. */
  spawnOffset: number
}

/** Persisted behavior state for each puck. */
export type PuckStateId = 0 | 1 | 2 | 3 | 4

export const PuckStates = {
  Hunting: 0 as PuckStateId,
  Engaged: 1 as PuckStateId,
  Retreating: 2 as PuckStateId,
  Regrouping: 3 as PuckStateId,
  Advancing: 4 as PuckStateId,
}

export const PUCK_STATE_NAMES = [
  'Hunting',
  'Engaged',
  'Retreating',
  'Regrouping',
  'Advancing',
] as const

export type PuckStateName = (typeof PUCK_STATE_NAMES)[number]

export type CombatMode = 'damage' | 'instant_kill' | 'convert'

export type TeamId = 0 | 1

export type HpBand = {
  /** Inclusive lower bound of the seen band. */
  low: number
  /** Exclusive upper bound, except for the top band which includes max HP. */
  high: number
  /** Band index 0 = lowest. */
  index: number
}

export type SeenEntity = {
  id: number
  type: TypeId
  team: TeamId
  /** Relative position from observer. */
  dx: number
  dy: number
  /** Distance to observer. */
  dist: number
  band: HpBand
}

export type Observation = {
  selfId: number
  type: TypeId
  team: TeamId
  x: number
  y: number
  hp: number
  maxHp: number
  prey: SeenEntity[]
  predators: SeenEntity[]
  sameTier: SeenEntity[]
  teammates: SeenEntity[]
}

/** behavior(observation) -> desired direction (unnormalized ok; zero = hold). */
export type BehaviorFn = (observation: Observation) => { x: number; y: number }

export type MatchResult = {
  winner: TeamId | null
  reason: 'zone' | 'draw' | 'unfinished'
  elapsed: number
  survivorsA: number
  survivorsB: number
  spawnedA: number
  spawnedB: number
  lostA: number
  lostB: number
  seed: number
  mode: CombatMode
}

/** Player spawn recorded for replay. Applied at the start of `tick`. */
export type SpawnInput = {
  tick: number
  type: TypeId
}

export type SimConfig = {
  types: TypesData
  damage: DamageMatrix
  tuning: TuningData
  mode: CombatMode
  seed: number
  inputs?: SpawnInput[]
}
