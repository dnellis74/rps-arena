import { buildObservation } from './perception.ts'
import type { BehaviorFn, DamageMatrix } from './types.ts'
import { aliveEntities, typeIdOf, type EcsWorld } from './world.ts'

/**
 * Apply behavior intent + separation + wall avoidance, then integrate position.
 *
 * Intent is a direction (normalized) per spec §4. Separation skips enemies this
 * puck preys on so Seek can close to contact. Wall push that fights the intent
 * is dropped while closing on an enemy ahead — otherwise cornered prey stall
 * outside hit range. Full walls remain when fleeing (enemy is behind intent).
 *
 * "Keep clear" lives only in behavior for same-tier without HP advantage; rock
 * vs scissors is prey and must engage.
 */
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
    const raw = behavior(obs)

    let ix = raw.x
    let iy = raw.y
    const ilen = Math.hypot(ix, iy)
    if (ilen > 1e-8) {
      ix /= ilen
      iy /= ilen
    } else {
      ix = 0
      iy = 0
    }

    let fx = ix * weights.intent
    let fy = iy * weights.intent

    const ox = components.Position.x[eid]!
    const oy = components.Position.y[eid]!
    const selfType = typeIdOf(world, eid)
    const selfTeam = components.Team[eid]!

    let closingOnEnemy = false

    for (const other of eids) {
      if (other === eid) continue
      const dx = ox - components.Position.x[other]!
      const dy = oy - components.Position.y[other]!
      const dist = Math.hypot(dx, dy)
      if (dist <= 0) continue

      const otherTeam = components.Team[other]!
      const otherType = typeIdOf(world, other)
      const preysOnOther =
        otherTeam !== selfTeam &&
        (damage[selfType]?.[otherType] ?? 0) >
          (damage[otherType]?.[selfType] ?? 0)

      // Toward-other unit (from self to other) is (-dx/dist, -dy/dist).
      if (otherTeam !== selfTeam && (ix !== 0 || iy !== 0)) {
        const towardDot = (-dx / dist) * ix + (-dy / dist) * iy
        if (towardDot > 0.5 && dist < tuning.threatRadius) {
          closingOnEnemy = true
        }
      }

      // Separation: skip prey we are allowed/meant to touch.
      if (preysOnOther) continue
      if (dist < separationRadius) {
        const strength = (separationRadius - dist) / separationRadius
        fx += (dx / dist) * strength * weights.separation
        fy += (dy / dist) * strength * weights.separation
      }
    }

    let wx = 0
    let wy = 0
    if (ox < wallMargin) wx += ((wallMargin - ox) / wallMargin) * weights.walls
    if (ox > arenaWidth - wallMargin)
      wx -= ((ox - (arenaWidth - wallMargin)) / wallMargin) * weights.walls
    if (oy < wallMargin) wy += ((wallMargin - oy) / wallMargin) * weights.walls
    if (oy > arenaHeight - wallMargin)
      wy -= ((oy - (arenaHeight - wallMargin)) / wallMargin) * weights.walls

    if (closingOnEnemy && (ix !== 0 || iy !== 0)) {
      const oppose = wx * ix + wy * iy
      if (oppose < 0) {
        wx -= ix * oppose
        wy -= iy * oppose
      }
    }

    fx += wx
    fy += wy

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
