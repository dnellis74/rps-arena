import type { Match, PuckSnapshot } from '../sim/match.ts'
import { buildObservation } from '../sim/perception.ts'
import type { CombatMode, TeamId } from '../sim/types.ts'

const TEAM_FILL: Record<TeamId, string> = {
  0: '#2f6fed',
  1: '#e87a2a',
}

export type ViewTransform = {
  scale: number
  offsetX: number
  offsetY: number
  canvasW: number
  canvasH: number
}

export function computeView(
  canvasW: number,
  canvasH: number,
  arenaW: number,
  arenaH: number,
): ViewTransform {
  const scale = Math.min(canvasW / arenaW, canvasH / arenaH)
  const drawW = arenaW * scale
  const drawH = arenaH * scale
  return {
    scale,
    offsetX: (canvasW - drawW) / 2,
    offsetY: (canvasH - drawH) / 2,
    canvasW,
    canvasH,
  }
}

export function worldToScreen(
  x: number,
  y: number,
  view: ViewTransform,
  arenaH: number,
): { x: number; y: number } {
  // Y-up in sim (0 at bottom); canvas Y grows downward — flip.
  return {
    x: view.offsetX + x * view.scale,
    y: view.offsetY + (arenaH - y) * view.scale,
  }
}

export function screenToWorld(
  sx: number,
  sy: number,
  view: ViewTransform,
  arenaH: number,
): { x: number; y: number } {
  return {
    x: (sx - view.offsetX) / view.scale,
    y: arenaH - (sy - view.offsetY) / view.scale,
  }
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  match: Match,
  pucks: PuckSnapshot[],
  view: ViewTransform,
  selectedId: number | null,
): void {
  const { tuning } = match.world
  const { arenaWidth: W, arenaHeight: H } = tuning

  ctx.clearRect(0, 0, view.canvasW, view.canvasH)

  // Letterbox background
  ctx.fillStyle = '#1a1c22'
  ctx.fillRect(0, 0, view.canvasW, view.canvasH)

  // Arena floor
  const origin = worldToScreen(0, H, view, H)
  ctx.fillStyle = '#2a2e38'
  ctx.fillRect(origin.x, origin.y, W * view.scale, H * view.scale)

  // Subtle thirds
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  for (let t = 1; t <= 2; t++) {
    const y = (H / 3) * t
    const a = worldToScreen(0, y, view, H)
    const b = worldToScreen(W, y, view, H)
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }

  // Selection lines to prey / predator
  if (selectedId !== null) {
    const sel = pucks.find((p) => p.id === selectedId)
    if (sel) {
      const obs = buildObservation(match.world, selectedId, match.damage)
      const from = worldToScreen(sel.x, sel.y, view, H)
      if (obs.prey[0]) {
        const t = worldToScreen(
          sel.x + obs.prey[0].dx,
          sel.y + obs.prey[0].dy,
          view,
          H,
        )
        strokeLine(ctx, from, t, 'rgba(80, 220, 120, 0.85)', 2)
      }
      if (obs.predators[0]) {
        const t = worldToScreen(
          sel.x + obs.predators[0].dx,
          sel.y + obs.predators[0].dy,
          view,
          H,
        )
        strokeLine(ctx, from, t, 'rgba(240, 70, 70, 0.85)', 2)
      }
    }
  }

  for (const p of pucks) {
    const c = worldToScreen(p.x, p.y, view, H)
    const r = p.radius * view.scale

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

    // Tiny HP pip
    const hpFrac = p.hp / p.maxHp
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(c.x - r, c.y + r + 2, r * 2, 3)
    ctx.fillStyle = hpFrac > 0.34 ? '#9fe870' : '#f0c040'
    ctx.fillRect(c.x - r, c.y + r + 2, r * 2 * hpFrac, 3)
  }
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
