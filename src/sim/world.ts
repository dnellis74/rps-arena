import { createWorld, addEntity, removeEntity, addComponent, query } from 'bitecs'
import { PuckStates } from './types.ts'
import type { CombatMode, TeamId, TypeId, TypesData, TuningData } from './types.ts'

export type Components = {
  Position: { x: Float32Array; y: Float32Array }
  Velocity: { x: Float32Array; y: Float32Array }
  Radius: Float32Array
  Speed: Float32Array
  Hp: Float32Array
  MaxHp: Float32Array
  Team: Int8Array
  TypeIndex: Int16Array
  HitCooldown: Float32Array
  Alive: Uint8Array
  /** PuckStates value. */
  State: Int8Array
  TimeInState: Float32Array
  /** Engaged target eid, or -1. */
  TargetEid: Int32Array
  /** Seconds remaining before Engaged is allowed (except gang-up). */
  ReengageLockout: Float32Array
  /** Seconds remaining before another state change is allowed. */
  StateChangeCooldown: Float32Array
  /**
   * Team lead from this puck's view: -1 behind, 0 unset/even, 1 ahead.
   * Updated with hysteresis.
   */
  TeamLead: Int8Array
}

export type StateMetrics = {
  /** Cumulative seconds spent in each state across all live pucks. */
  timeInState: [number, number, number, number, number]
  /** Number of state transitions. */
  changes: number
  /** Integral of live puck count over time (puck-seconds). */
  puckSeconds: number
  /** Named transition counts for batch reporting. */
  transitions: Record<string, number>
}

export type SimWorld = {
  components: Components
  typeIds: TypeId[]
  typeIndex: Map<TypeId, number>
  types: TypesData
  tuning: TuningData
  mode: CombatMode
  elapsed: number
  timeSinceHit: number
  finished: boolean
  winner: TeamId | null
  reason: 'zone' | 'draw' | 'unfinished' | null
  tick: number
  charges: [number, number]
  /** Seconds accumulated toward the next charge, per side. */
  chargeProgress: [number, number]
  spawned: [number, number]
  lost: [number, number]
  stateMetrics: StateMetrics
}

/** Entity storage sized for the match (both sides + spare). */
export function createSimWorld(
  types: TypesData,
  tuning: TuningData,
  mode: CombatMode,
  entityCapacity: number,
): SimWorld {
  const cap = Math.max(16, Math.ceil(entityCapacity))
  const typeIds = Object.keys(types)
  const typeIndex = new Map(typeIds.map((id, i) => [id, i]))

  const world = createWorld({
    components: {
      Position: { x: new Float32Array(cap), y: new Float32Array(cap) },
      Velocity: { x: new Float32Array(cap), y: new Float32Array(cap) },
      Radius: new Float32Array(cap),
      Speed: new Float32Array(cap),
      Hp: new Float32Array(cap),
      MaxHp: new Float32Array(cap),
      Team: new Int8Array(cap),
      TypeIndex: new Int16Array(cap),
      HitCooldown: new Float32Array(cap),
      Alive: new Uint8Array(cap),
      State: new Int8Array(cap),
      TimeInState: new Float32Array(cap),
      TargetEid: new Int32Array(cap),
      ReengageLockout: new Float32Array(cap),
      StateChangeCooldown: new Float32Array(cap),
      TeamLead: new Int8Array(cap),
    },
    typeIds,
    typeIndex,
    types,
    tuning,
    mode,
    elapsed: 0,
    timeSinceHit: 0,
    finished: false,
    winner: null as TeamId | null,
    reason: null as 'zone' | 'draw' | 'unfinished' | null,
    tick: 0,
    charges: [0, 0],
    chargeProgress: [0, 0],
    spawned: [0, 0],
    lost: [0, 0],
    stateMetrics: {
      timeInState: [0, 0, 0, 0, 0],
      changes: 0,
      puckSeconds: 0,
      transitions: {},
    },
  }) as unknown as ReturnType<typeof createWorld> & SimWorld

  return world as unknown as SimWorld & ReturnType<typeof createWorld>
}

export type EcsWorld = SimWorld & Parameters<typeof addEntity>[0]

export function spawnPuck(
  world: EcsWorld,
  opts: {
    x: number
    y: number
    team: TeamId
    type: TypeId
  },
): number {
  const eid = addEntity(world)
  const { components, types, typeIndex } = world
  const def = types[opts.type]!
  const ti = typeIndex.get(opts.type)
  if (ti === undefined) throw new Error(`Unknown type ${opts.type}`)

  addComponent(world, eid, components.Position)
  addComponent(world, eid, components.Velocity)
  addComponent(world, eid, components.Radius)
  addComponent(world, eid, components.Speed)
  addComponent(world, eid, components.Hp)
  addComponent(world, eid, components.MaxHp)
  addComponent(world, eid, components.Team)
  addComponent(world, eid, components.TypeIndex)
  addComponent(world, eid, components.HitCooldown)
  addComponent(world, eid, components.Alive)
  addComponent(world, eid, components.State)
  addComponent(world, eid, components.TimeInState)
  addComponent(world, eid, components.TargetEid)
  addComponent(world, eid, components.ReengageLockout)
  addComponent(world, eid, components.StateChangeCooldown)
  addComponent(world, eid, components.TeamLead)

  components.Position.x[eid] = opts.x
  components.Position.y[eid] = opts.y
  components.Velocity.x[eid] = 0
  components.Velocity.y[eid] = 0
  components.Radius[eid] = def.radius
  components.Speed[eid] = def.speed
  components.Hp[eid] = def.hp
  components.MaxHp[eid] = def.hp
  components.Team[eid] = opts.team
  components.TypeIndex[eid] = ti
  components.HitCooldown[eid] = 0
  components.Alive[eid] = 1
  components.State[eid] = PuckStates.Hunting
  components.TimeInState[eid] = 0
  components.TargetEid[eid] = -1
  components.ReengageLockout[eid] = 0
  components.StateChangeCooldown[eid] = 0
  components.TeamLead[eid] = 0
  return eid
}

export function killPuck(world: EcsWorld, eid: number): void {
  if (!world.components.Alive[eid]) return
  const team = world.components.Team[eid]!
  if (team === 0 || team === 1) world.lost[team]++
  world.components.Alive[eid] = 0
  removeEntity(world, eid)
}

export function aliveEntities(world: EcsWorld): number[] {
  return [...query(world, [world.components.Alive])].filter(
    (eid) => world.components.Alive[eid] === 1,
  )
}

export function typeIdOf(world: SimWorld, eid: number): TypeId {
  return world.typeIds[world.components.TypeIndex[eid]!]!
}

export function recordTransition(world: SimWorld, name: string): void {
  world.stateMetrics.transitions[name] =
    (world.stateMetrics.transitions[name] ?? 0) + 1
}
