import type { Match, PuckSnapshot } from '../sim/match.ts'
import { buildObservation } from '../sim/perception.ts'
import { spawnZoneCenter } from '../sim/spawn.ts'
import {
  counterAllyLink,
  nearestDefendAlly,
  supportAlly,
} from '../sim/targeting.ts'
import { PuckStates, type CombatMode, type TeamId } from '../sim/types.ts'
import {
  minimapLayout,
  visibleWorldRect,
  worldToScreen,
  type Camera,
} from './camera.ts'

const TEAM_FILL: Record<TeamId, string> = {
  0: '#2f6fed',
  1: '#e87a2a',
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  match: Match,
  pucks: PuckSnapshot[],
  cam: Camera,
  selectedId: number | null,
): void {
  const { tuning } = match.world
  const { arenaWidth: W, arenaHeight: H } = tuning

  ctx.clearRect(0, 0, cam.viewportW, cam.viewportH)

  ctx.fillStyle = '#1a1c22'
  ctx.fillRect(0, 0, cam.viewportW, cam.viewportH)

  const origin = worldToScreen(cam, 0, H)
  ctx.fillStyle = '#2a2e38'
  ctx.fillRect(origin.x, origin.y, W * cam.scale, H * cam.scale)

  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  for (let t = 1; t <= 2; t++) {
    const y = (H / 3) * t
    const a = worldToScreen(cam, 0, y)
    const b = worldToScreen(cam, W, y)
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }

  drawSpawnZones(ctx, cam, tuning)

  if (selectedId !== null) {
    const sel = pucks.find((p) => p.id === selectedId)
    if (sel) {
      const obs = buildObservation(match.world, selectedId, match.damage)
      const from = worldToScreen(cam, sel.x, sel.y)
      if (obs.prey[0]) {
        const t = worldToScreen(
          cam,
          sel.x + obs.prey[0].dx,
          sel.y + obs.prey[0].dy,
        )
        strokeLine(ctx, from, t, 'rgba(80, 220, 120, 0.85)', 2)
      }
      if (obs.predators[0]) {
        const t = worldToScreen(
          cam,
          sel.x + obs.predators[0].dx,
          sel.y + obs.predators[0].dy,
        )
        strokeLine(ctx, from, t, 'rgba(240, 70, 70, 0.85)', 2)
      }
      const link = counterAllyLink(obs, match.damage)
      if (link) {
        const t = worldToScreen(
          cam,
          sel.x + link.ally.dx,
          sel.y + link.ally.dy,
        )
        strokeLine(ctx, from, t, 'rgba(80, 210, 230, 0.9)', 2)
      }
      const defend = nearestDefendAlly(obs, match.damage)
      if (defend) {
        const t = worldToScreen(cam, sel.x + defend.dx, sel.y + defend.dy)
        strokeLine(ctx, from, t, 'rgba(186, 140, 255, 0.9)', 2)
      }
      if (sel.targetId !== null) {
        const tgt = pucks.find((p) => p.id === sel.targetId)
        if (tgt) {
          const t = worldToScreen(cam, tgt.x, tgt.y)
          strokeLine(ctx, from, t, 'rgba(255, 220, 80, 0.95)', 2.5)
        }
      }
      const losing = match.world.components.TeamLead[sel.id]! < 0
      const support = supportAlly(obs, match.damage, losing)
      if (support) {
        const t = worldToScreen(
          cam,
          sel.x + support.dx,
          sel.y + support.dy,
        )
        strokeLine(ctx, from, t, 'rgba(255, 255, 255, 0.55)', 1.5)
      }
    }
  }

  for (const p of pucks) {
    const c = worldToScreen(cam, p.x, p.y)
    const r = p.radius * cam.scale

    ctx.beginPath()
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2)
    ctx.fillStyle = TEAM_FILL[p.team]
    ctx.fill()
    if (p.state === PuckStates.Advancing) drawAdvanceArrow(ctx, c.x, c.y, r, p)

    if (selectedId === p.id) {
      ctx.setLineDash([])
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(c.x, c.y, r + 3, 0, Math.PI * 2)
      ctx.stroke()
    }

    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${Math.max(10, r * 1.2)}px "IBM Plex Mono", ui-monospace, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(p.glyph, c.x, c.y + 0.5)

    const barW = r * 2
    const barH = 3
    const barX = c.x - r
    const barY = c.y + r + 2
    const hpFrac = p.hp / p.maxHp
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(barX, barY, barW, barH)
    ctx.fillStyle = hpFrac > 0.34 ? '#9fe870' : '#f0c040'
    ctx.fillRect(barX, barY, barW * hpFrac, barH)

    // State marker: small square at the base of the HP bar.
    const mark = Math.max(4, Math.min(7, barH + 2))
    drawStateMark(ctx, barX - mark - 1, barY + (barH - mark) / 2, mark, p)
  }

  drawMinimap(ctx, cam, pucks)
}

function drawStateMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  p: PuckSnapshot,
): void {
  ctx.setLineDash([])
  ctx.lineWidth = 1.25
  if (p.state === PuckStates.Hunting) {
    // Empty square — hunting has no fill.
    ctx.strokeStyle = 'rgba(200, 210, 230, 0.55)'
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1)
    return
  }
  if (p.state === PuckStates.Engaged) {
    ctx.fillStyle = TEAM_FILL[p.team]
    ctx.fillRect(x, y, size, size)
    return
  }
  if (p.state === PuckStates.Retreating) {
    ctx.fillStyle = '#f0c040'
    ctx.fillRect(x, y, size, size)
    return
  }
  if (p.state === PuckStates.Advancing) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(x, y, size, size)
    return
  }
  // Regrouping: hollow square with thick border.
  ctx.strokeStyle = '#9ec0ff'
  ctx.lineWidth = 2
  ctx.strokeRect(x + 1, y + 1, size - 2, size - 2)
}

function drawAdvanceArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  p: PuckSnapshot,
): void {
  let sx = p.vx
  let sy = -p.vy
  if (Math.hypot(sx, sy) < 1e-3) {
    sx = 0
    sy = p.team === 0 ? -1 : 1
  }
  const len = Math.hypot(sx, sy) || 1
  sx /= len
  sy /= len
  const px = -sy
  const py = sx
  const reach = Math.max(7, r * 1.15)
  const tipX = x + sx * reach
  const tipY = y + sy * reach
  const base = Math.max(3.5, r * 0.45)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(tipX, tipY)
  ctx.lineTo(x + px * base, y + py * base)
  ctx.lineTo(x - px * base, y - py * base)
  ctx.closePath()
  ctx.fill()
}

function drawSpawnZones(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  matchTuning: { arenaWidth: number; arenaHeight: number; spawnZoneRadius: number },
): void {
  for (const team of [0, 1] as const) {
    const zone = spawnZoneCenter(
      matchTuning as Parameters<typeof spawnZoneCenter>[0],
      team,
    )
    const c = worldToScreen(cam, zone.x, zone.y)
    const rr = matchTuning.spawnZoneRadius * cam.scale
    ctx.beginPath()
    ctx.arc(c.x, c.y, rr, 0, Math.PI * 2)
    ctx.fillStyle =
      team === 0 ? 'rgba(47, 111, 237, 0.28)' : 'rgba(232, 122, 42, 0.28)'
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = TEAM_FILL[team]
    ctx.stroke()
  }
}

function drawMinimap(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pucks: PuckSnapshot[],
): void {
  const layout = minimapLayout(cam)
  if (!layout) return

  const { x, y, size } = layout
  ctx.fillStyle = 'rgba(12, 14, 20, 0.72)'
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 1
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, size, size, 6)
  } else {
    ctx.rect(x, y, size, size)
  }
  ctx.fill()
  ctx.stroke()

  const fit = Math.min(size / cam.arenaW, size / cam.arenaH)
  const drawW = cam.arenaW * fit
  const drawH = cam.arenaH * fit
  const ox = x + (size - drawW) / 2
  const oy = y + (size - drawH) / 2

  ctx.fillStyle = '#2a2e38'
  ctx.fillRect(ox, oy, drawW, drawH)

  for (const p of pucks) {
    const px = ox + p.x * fit
    const py = oy + (cam.arenaH - p.y) * fit
    ctx.beginPath()
    ctx.arc(px, py, Math.max(1.5, fit * 0.35), 0, Math.PI * 2)
    ctx.fillStyle = TEAM_FILL[p.team]
    ctx.fill()
  }

  const vis = visibleWorldRect(cam)
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'
  ctx.lineWidth = 1.5
  ctx.strokeRect(
    ox + vis.x * fit,
    oy + (cam.arenaH - vis.y - vis.h) * fit,
    vis.w * fit,
    vis.h * fit,
  )
}

function strokeLine(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  color: string,
  width: number,
): void {
  ctx.setLineDash([])
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.stroke()
}

export function hitTestPuck(
  wx: number,
  wy: number,
  pucks: PuckSnapshot[],
  pad = 0.15,
): PuckSnapshot | null {
  let best: PuckSnapshot | null = null
  let bestD = Infinity
  for (const p of pucks) {
    const d = Math.hypot(p.x - wx, p.y - wy)
    if (d <= p.radius + pad && d < bestD) {
      best = p
      bestD = d
    }
  }
  return best
}

export function modeLabel(mode: CombatMode): string {
  switch (mode) {
    case 'damage':
      return 'Damage'
    case 'instant_kill':
      return 'Instant kill'
    case 'convert':
      return 'Convert'
  }
}
