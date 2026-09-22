import { derivesPrey } from './relationships.ts'
import type { DamageMatrix } from './types.ts'
import { aliveEntities, killPuck, typeIdOf, type EcsWorld } from './world.ts'

/** Resolve pairwise contact: combat then separation. Returns whether any hit landed. */
export function resolveContacts(world: EcsWorld, damage: DamageMatrix): boolean {
  const { components, mode, types, tuning } = world
  const eids = aliveEntities(world)
  let hitLanded = false

  // Collect removals / conversions after pairwise pass to keep iteration stable.
  const toKill = new Set<number>()
  const conversions: {
    eid: number
    newTeam: 0 | 1
    newType: string
  }[] = []

  for (let i = 0; i < eids.length; i++) {
    const a = eids[i]!
    if (toKill.has(a)) continue
    for (let j = i + 1; j < eids.length; j++) {
      const b = eids[j]!
      if (toKill.has(b)) continue

      const ax = components.Position.x[a]!
      const ay = components.Position.y[a]!
      const bx = components.Position.x[b]!
      const by = components.Position.y[b]!
      const ra = components.Radius[a]!
      const rb = components.Radius[b]!
      let dx = bx - ax
      let dy = by - ay
      let dist = Math.hypot(dx, dy)
      const minDist = ra + rb
      // Allow tiny float error after separation so sustained contact still hits.
      if (dist > minDist + 1e-4) continue

      if (dist < 1e-8) {
        dx = 1
        dy = 0
        dist = 1
      }

      const teamA = components.Team[a]!
      const teamB = components.Team[b]!
      const typeA = typeIdOf(world, a)
      const typeB = typeIdOf(world, b)

      if (teamA !== teamB) {
        const aPreysB = derivesPrey(damage, typeA, typeB)
        const bPreysA = derivesPrey(damage, typeB, typeA)

        if (mode === 'damage') {
          if (components.HitCooldown[a]! <= 0) {
            const dmg = damage[typeA]?.[typeB] ?? 0
            if (dmg > 0) {
              components.Hp[b]! -= dmg
              components.HitCooldown[a] = tuning.hitCooldown
              hitLanded = true
            }
          }
          if (components.HitCooldown[b]! <= 0) {
            const dmg = damage[typeB]?.[typeA] ?? 0
            if (dmg > 0) {
              components.Hp[a]! -= dmg
              components.HitCooldown[b] = tuning.hitCooldown
              hitLanded = true
            }
          }
        } else if (mode === 'instant_kill') {
          if (aPreysB && !bPreysA) {
            toKill.add(b)
            hitLanded = true
          } else if (bPreysA && !aPreysB) {
            toKill.add(a)
            hitLanded = true
          }
          // same-tier: nothing
        } else if (mode === 'convert') {
          if (aPreysB && !bPreysA) {
            conversions.push({ eid: b, newTeam: teamA as 0 | 1, newType: typeA })
            hitLanded = true
          } else if (bPreysA && !aPreysB) {
            conversions.push({ eid: a, newTeam: teamB as 0 | 1, newType: typeB })
            hitLanded = true
          }
        }
      }

      // Collision separation: push both apart by half the overlap.
      const overlap = Math.max(0, minDist - dist)
      if (overlap > 0) {
        const nx = dx / dist
        const ny = dy / dist
        const push = overlap / 2
        components.Position.x[a]! -= nx * push
        components.Position.y[a]! -= ny * push
        components.Position.x[b]! += nx * push
        components.Position.y[b]! += ny * push
      }
    }
  }

  for (const c of conversions) {
    if (toKill.has(c.eid) || !components.Alive[c.eid]) continue
    const def = types[c.newType]!
    const ti = world.typeIndex.get(c.newType)
    if (ti === undefined) continue
    components.Team[c.eid] = c.newTeam
    components.TypeIndex[c.eid] = ti
    components.MaxHp[c.eid] = def.hp
    components.Hp[c.eid] = def.hp * def.convertHp
    components.Speed[c.eid] = def.speed
    components.Radius[c.eid] = def.radius
    components.HitCooldown[c.eid] = tuning.hitCooldown
  }

  for (const eid of eids) {
    if (toKill.has(eid)) continue
    if (components.Alive[eid] && components.Hp[eid]! <= 0) {
      toKill.add(eid)
    }
  }

  for (const eid of toKill) {
    killPuck(world, eid)
  }

  clampAll(world)
  return hitLanded
}

function clampAll(world: EcsWorld): void {
  const { components, tuning } = world
  const W = tuning.arenaWidth
  const H = tuning.arenaHeight
  for (const eid of aliveEntities(world)) {
    const r = components.Radius[eid]!
    components.Position.x[eid] = clamp(components.Position.x[eid]!, r, W - r)
    components.Position.y[eid] = clamp(components.Position.y[eid]!, r, H - r)
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
