import { derivesPrey, hpBand, isSameTier } from './relationships.ts'
import type { DamageMatrix, Observation, SeenEntity, TeamId } from './types.ts'
import { aliveEntities, typeIdOf, type EcsWorld } from './world.ts'

export function buildObservation(
  world: EcsWorld,
  eid: number,
  damage: DamageMatrix,
): Observation {
  const { components, types } = world
  const ownType = typeIdOf(world, eid)
  const ownTeam = components.Team[eid] as TeamId
  const ox = components.Position.x[eid]!
  const oy = components.Position.y[eid]!
  const bandFrac = types[ownType]!.hpBandSize

  const prey: SeenEntity[] = []
  const predators: SeenEntity[] = []
  const sameTier: SeenEntity[] = []
  const teammates: SeenEntity[] = []

  for (const other of aliveEntities(world)) {
    if (other === eid) continue
    const oType = typeIdOf(world, other)
    const oTeam = components.Team[other] as TeamId
    const dx = components.Position.x[other]! - ox
    const dy = components.Position.y[other]! - oy
    const dist = Math.hypot(dx, dy)
    const maxHp = components.MaxHp[other]!
    const band = hpBand(components.Hp[other]!, maxHp, bandFrac)
    const seen: SeenEntity = {
      id: other,
      type: oType,
      team: oTeam,
      dx,
      dy,
      dist,
      band,
    }

    if (oTeam === ownTeam) {
      teammates.push(seen)
      continue
    }

    if (derivesPrey(damage, ownType, oType)) prey.push(seen)
    else if (derivesPrey(damage, oType, ownType)) predators.push(seen)
    else if (isSameTier(damage, ownType, oType)) sameTier.push(seen)
  }

  const byDist = (a: SeenEntity, b: SeenEntity) => a.dist - b.dist
  prey.sort(byDist)
  predators.sort(byDist)
  sameTier.sort(byDist)
  teammates.sort(byDist)

  return {
    selfId: eid,
    type: ownType,
    team: ownTeam,
    x: ox,
    y: oy,
    hp: components.Hp[eid]!,
    maxHp: components.MaxHp[eid]!,
    prey,
    predators,
    sameTier,
    teammates,
  }
}
