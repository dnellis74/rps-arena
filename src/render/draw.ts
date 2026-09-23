import type { Match, PuckSnapshot } from '../sim/match.ts'
import { buildObservation } from '../sim/perception.ts'
import { counterAllyLink } from '../sim/targeting.ts'
import type { CombatMode, TeamId } from '../sim/types.ts'
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

  // Selection lines: prey (green), predator (red), counter-ally (cyan)
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
    }
  }

  for (const p of pucks) {
    const c = worldToScreen(cam, p.x, p.y)
    const r = p.radius * cam.scale

    ctx.beginPath()
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2)
    ctx.fillStyle = TEAM_FILL[p.team]
    ctx.fill()

    if (selectedId === p.id) {
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2.5
      ctx.stroke()
    }

    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${Math.max(10, r * 1.2)}px "IBM Plex Mono", ui-monospace, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(p.glyph, c.x, c.y + 0.5)

    const hpFrac = p.hp / p.maxHp
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(c.x - r, c.y + r + 2, r * 2, 3)
    ctx.fillStyle = hpFrac > 0.34 ? '#9fe870' : '#f0c040'
    ctx.fillRect(c.x - r, c.y + r + 2, r * 2 * hpFrac, 3)
  }

  drawMinimap(ctx, cam, pucks)
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
  // roundRect is widely supported; fall back to rect if missing.
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
