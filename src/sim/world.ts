import { createWorld, addEntity, removeEntity, addComponent, query } from 'bitecs'
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
  reason: 'elimination' | 'stalemate' | null
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
    reason: null as 'elimination' | 'stalemate' | null,
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
  return eid
}

export function killPuck(world: EcsWorld, eid: number): void {
  if (!world.components.Alive[eid]) return
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
