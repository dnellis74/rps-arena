import type { SeededRng } from './rng.ts'
import type { RosterData, TeamId, TypeId, TuningData } from './types.ts'
import { spawnPuck, type EcsWorld } from './world.ts'

/** Total pucks spawned on one side from roster counts. */
export function rosterSideCount(roster: RosterData): number {
  let n = 0
  for (const count of Object.values(roster)) n += count
  return n
}

/** Expand roster counts into a flat list of type ids, then shuffle. */
export function expandRoster(roster: RosterData, rng: SeededRng): TypeId[] {
  const list: TypeId[] = []
  for (const [type, count] of Object.entries(roster)) {
    for (let i = 0; i < count; i++) list.push(type)
  }
  return rng.shuffle(list)
}

/**
 * Place pucks in rows within the team's third of the arena, with small jitter.
 * Team A: bottom third. Team B: top third.
 */
export function spawnTeam(
  world: EcsWorld,
  team: TeamId,
  roster: TypeId[],
  tuning: TuningData,
  rng: SeededRng,
): void {
  const { arenaWidth: W, arenaHeight: H, spawnJitter } = tuning
  const third = H / 3
  const yMin = team === 0 ? 0 : H - third
  const yMax = team === 0 ? third : H

  const cols = Math.ceil(Math.sqrt(roster.length))
  const rows = Math.ceil(roster.length / cols)
  const marginX = 1.5
  const marginY = 1.2
  const usableW = W - marginX * 2
  const usableH = yMax - yMin - marginY * 2
  const cellW = cols > 1 ? usableW / (cols - 1) : 0
  const cellH = rows > 1 ? usableH / (rows - 1) : 0

  roster.forEach((type, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const baseX = marginX + (cols === 1 ? usableW / 2 : col * cellW)
    const baseY =
      yMin + marginY + (rows === 1 ? usableH / 2 : row * cellH)
    const x = clamp(
      baseX + rng.range(-spawnJitter, spawnJitter),
      0.5,
      W - 0.5,
    )
    const y = clamp(
      baseY + rng.range(-spawnJitter, spawnJitter),
      yMin + 0.5,
      yMax - 0.5,
    )
    spawnPuck(world, { x, y, team, type })
  })
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
