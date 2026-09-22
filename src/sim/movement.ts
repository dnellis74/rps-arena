import { buildObservation } from './perception.ts'
import type { BehaviorFn, DamageMatrix } from './types.ts'
import { aliveEntities, type EcsWorld } from './world.ts'

/** Apply behavior intent + separation + wall avoidance, then integrate position. */
export function stepMovement(
  world: EcsWorld,
  damage: DamageMatrix,
  behavior: BehaviorFn,
  dt: number,
): void {
  const { components, tuning } = world
  const { separationRadius, wallMargin, weights, arenaWidth, arenaHeight } =
    tuning

  const eids = aliveEntities(world)

  for (const eid of eids) {
    const obs = buildObservation(world, eid, damage)
    const intent = behavior(obs)

    let fx = intent.x * weights.intent
    let fy = intent.y * weights.intent

    // Separation from all nearby pucks.
    const ox = components.Position.x[eid]!
    const oy = components.Position.y[eid]!
    for (const other of eids) {
      if (other === eid) continue
      const dx = ox - components.Position.x[other]!
      const dy = oy - components.Position.y[other]!
      const dist = Math.hypot(dx, dy)
      if (dist > 0 && dist < separationRadius) {
        const strength = (separationRadius - dist) / separationRadius
        fx += (dx / dist) * strength * weights.separation
        fy += (dy / dist) * strength * weights.separation
      }
    }

    // Wall push.
    if (ox < wallMargin) fx += ((wallMargin - ox) / wallMargin) * weights.walls
    if (ox > arenaWidth - wallMargin)
      fx -= ((ox - (arenaWidth - wallMargin)) / wallMargin) * weights.walls
    if (oy < wallMargin) fy += ((wallMargin - oy) / wallMargin) * weights.walls
    if (oy > arenaHeight - wallMargin)
      fy -= ((oy - (arenaHeight - wallMargin)) / wallMargin) * weights.walls

    const len = Math.hypot(fx, fy)
    const speed = components.Speed[eid]!
    if (len > 1e-8) {
      components.Velocity.x[eid] = (fx / len) * speed
      components.Velocity.y[eid] = (fy / len) * speed
    } else {
      components.Velocity.x[eid] = 0
      components.Velocity.y[eid] = 0
    }

    components.Position.x[eid]! += components.Velocity.x[eid]! * dt
    components.Position.y[eid]! += components.Velocity.y[eid]! * dt
  }
}
