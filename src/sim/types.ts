export type TypeId = string

export type TypeDef = {
  glyph: string
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
export type RosterData = Record<TypeId, number>

export type TuningData = {
  arenaWidth: number
  arenaHeight: number
  threatRadius: number
  gangUpRadius: number
  hitCooldown: number
  stalemateTimeout: number
  separationRadius: number
  wallMargin: number
  weights: {
    intent: number
    separation: number
    walls: number
  }
  spawnJitter: number
  fixedDt: number
}

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
  reason: 'elimination' | 'stalemate'
  elapsed: number
  survivorsA: number
  survivorsB: number
  totalHpA: number
  totalHpB: number
  seed: number
  mode: CombatMode
}

export type SimConfig = {
  types: TypesData
  damage: DamageMatrix
  roster: RosterData
  tuning: TuningData
  mode: CombatMode
  seed: number
  behavior: BehaviorFn
}
