import type { SeededRng } from './rng.ts'
import type { TeamId, TuningData } from './types.ts'

/** Spawn-zone center. The circle sits inside the arena, tangent to a short edge. */
export function spawnZoneCenter(
  tuning: TuningData,
  team: TeamId,
): { x: number; y: number } {
  const x = tuning.arenaWidth / 2
  const y =
    team === 0
      ? tuning.spawnZoneRadius
      : tuning.arenaHeight - tuning.spawnZoneRadius
  return { x, y }
}

/** Center of the zone this team is trying to reach. */
export function enemySpawnZoneCenter(
  tuning: TuningData,
  team: TeamId,
): { x: number; y: number } {
  return spawnZoneCenter(tuning, team === 0 ? 1 : 0)
}

/**
 * Random point in a disk of radius `spawnOffset` around the zone center,
 * clamped so the unit body stays inside the arena.
 */
export function spawnPosition(
  tuning: TuningData,
  team: TeamId,
  unitRadius: number,
  rng: SeededRng,
): { x: number; y: number } {
  const center = spawnZoneCenter(tuning, team)
  const ang = rng.next() * Math.PI * 2
  const rad = Math.sqrt(rng.next()) * tuning.spawnOffset
  const x = center.x + Math.cos(ang) * rad
  const y = center.y + Math.sin(ang) * rad
  return {
    x: clamp(x, unitRadius, tuning.arenaWidth - unitRadius),
    y: clamp(y, unitRadius, tuning.arenaHeight - unitRadius),
  }
}

export function overlapsSpawnZone(
  tuning: TuningData,
  team: TeamId,
  x: number,
  y: number,
  radius: number,
): boolean {
  const zone = spawnZoneCenter(tuning, team)
  const reach = radius + tuning.spawnZoneRadius
  const dx = x - zone.x
  const dy = y - zone.y
  return dx * dx + dy * dy <= reach * reach
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
