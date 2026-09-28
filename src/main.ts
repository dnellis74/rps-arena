import './style.css'
import {
  countStatesByTeam,
  countTeams,
  createMatch,
  getMatchResult,
  loadGameData,
  queueSpawn,
  randomSeed,
  snapshotPucks,
  stepMatch,
  type CombatMode,
  type Match,
} from './sim/index.ts'
import type { TypeId } from './sim/types.ts'
import {
  centerOn,
  createCamera,
  minimapContains,
  minimapLayout,
  minimapScreenToWorld,
  panByScreen,
  screenToWorld,
  setViewport,
  zoomAt,
  type Camera,
} from './render/camera.ts'
import { drawFrame, hitTestPuck, modeLabel } from './render/draw.ts'

const data = loadGameData()

const PUCK_DIAMETER = 2 * data.types.rock!.radius
const TAP_SLOP_PX = 10

type Speed = 0 | 1 | 4

function parseSeedFromUrl(): number {
  const params = new URLSearchParams(location.search)
  const raw = params.get('seed')
  if (raw !== null && raw !== '') {
    const n = Number(raw)
    if (Number.isFinite(n)) return n >>> 0
  }
  return randomSeed()
}

function setSeedInUrl(seed: number): void {
  const url = new URL(location.href)
  url.searchParams.set('seed', String(seed))
  history.replaceState(null, '', url)
}

let seed = parseSeedFromUrl()
let mode: CombatMode = 'damage'
let match: Match = makeMatch(seed, mode)
let selectedId: number | null = null
let speed: Speed = 1
let accumulator = 0
let lastTs = performance.now()

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <header class="top-bar">
    <div class="brand">RPS Arena</div>
    <div class="status" id="status"></div>
  </header>
  <div class="stage">
    <canvas id="arena"></canvas>
    <div class="inspect" id="inspect"></div>
    <div class="end-screen hidden" id="end"></div>
  </div>
  <div class="controls">
    <button type="button" id="btn-pause" aria-label="Pause">Pause</button>
    <button type="button" id="btn-1x" class="active" aria-label="1x speed">1x</button>
    <button type="button" id="btn-4x" aria-label="4x speed">4x</button>
    <button type="button" id="btn-restart" aria-label="Restart same seed">Same seed</button>
    <button type="button" id="btn-new" aria-label="Restart new seed">New seed</button>
    <select id="mode" aria-label="Combat mode">
      <option value="damage">Damage</option>
      <option value="instant_kill">Instant kill</option>
      <option value="convert">Convert</option>
    </select>
    <div class="state-legend" aria-label="State marker legend">
      <span><i class="leg-hunt"></i>Hunt</span>
      <span><i class="leg-eng"></i>Engage</span>
      <span><i class="leg-ret"></i>Retreat</span>
      <span><i class="leg-reg"></i>Regroup</span>
      <span><i class="leg-adv"></i>Advance</span>
    </div>
    <div class="spawn-bar">
      <div class="charges" id="charges">Charges 0</div>
      <div class="charge-track" aria-hidden="true"><div id="charge-fill"></div></div>
      <div class="spawn-buttons">
        <button type="button" id="spawn-rock" class="spawn" disabled>R</button>
        <button type="button" id="spawn-paper" class="spawn" disabled>P</button>
        <button type="button" id="spawn-scissors" class="spawn" disabled>S</button>
      </div>
    </div>
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#arena')!
const ctx = canvas.getContext('2d')!
const statusEl = document.querySelector<HTMLDivElement>('#status')!
const inspectEl = document.querySelector<HTMLDivElement>('#inspect')!
const endEl = document.querySelector<HTMLDivElement>('#end')!
const btnPause = document.querySelector<HTMLButtonElement>('#btn-pause')!
const btn1x = document.querySelector<HTMLButtonElement>('#btn-1x')!
const btn4x = document.querySelector<HTMLButtonElement>('#btn-4x')!
const btnRestart = document.querySelector<HTMLButtonElement>('#btn-restart')!
const btnNew = document.querySelector<HTMLButtonElement>('#btn-new')!
const modeSelect = document.querySelector<HTMLSelectElement>('#mode')!
const chargesEl = document.querySelector<HTMLDivElement>('#charges')!
const chargeFill = document.querySelector<HTMLDivElement>('#charge-fill')!
const spawnButtons = {
  rock: document.querySelector<HTMLButtonElement>('#spawn-rock')!,
  paper: document.querySelector<HTMLButtonElement>('#spawn-paper')!,
  scissors: document.querySelector<HTMLButtonElement>('#spawn-scissors')!,
}

canvas.style.touchAction = 'none'

setSeedInUrl(seed)

let camera: Camera = createCamera({
  arenaW: data.tuning.arenaWidth,
  arenaH: data.tuning.arenaHeight,
  viewportW: 1,
  viewportH: 1,
  puckDiameter: PUCK_DIAMETER,
  maxZoomInPucksAcross: data.tuning.maxZoomInPucksAcross,
})

function makeMatch(s: number, m: CombatMode): Match {
  return createMatch({
    types: data.types,
    damage: data.damage,
    tuning: data.tuning,
    mode: m,
    seed: s,
  })
}

function restart(newSeed: number, newMode: CombatMode = mode): void {
  seed = newSeed
  mode = newMode
  match = makeMatch(seed, mode)
  selectedId = null
  accumulator = 0
  endEl.classList.add('hidden')
  endEl.innerHTML = ''
  setSeedInUrl(seed)
  modeSelect.value = mode
}

function setSpeed(s: Speed): void {
  speed = s
  btnPause.classList.toggle('active', s === 0)
  btn1x.classList.toggle('active', s === 1)
  btn4x.classList.toggle('active', s === 4)
  btnPause.textContent = s === 0 ? 'Resume' : 'Pause'
}

btnPause.addEventListener('click', () => setSpeed(speed === 0 ? 1 : 0))
btn1x.addEventListener('click', () => setSpeed(1))
btn4x.addEventListener('click', () => setSpeed(4))
btnRestart.addEventListener('click', () => restart(seed))
btnNew.addEventListener('click', () => restart(randomSeed()))
modeSelect.addEventListener('change', () => {
  restart(seed, modeSelect.value as CombatMode)
})

for (const type of ['rock', 'paper', 'scissors'] as const) {
  spawnButtons[type].addEventListener('click', () => {
    if (match.world.finished) return
    queueSpawn(match, type as TypeId)
    updateSpawnControls()
  })
}

window.addEventListener('keydown', (ev) => {
  if (ev.code !== 'Space' && ev.key !== ' ') return
  const t = ev.target as HTMLElement | null
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
    return
  }
  ev.preventDefault()
  setSpeed(speed === 0 ? 1 : 0)
})

/** CSS-pixel coords → canvas-pixel coords. */
function toCanvas(clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  return {
    x: ((clientX - rect.left) / rect.width) * canvas.width,
    y: ((clientY - rect.top) / rect.height) * canvas.height,
  }
}

function selectAtCanvas(sx: number, sy: number): void {
  const world = screenToWorld(camera, sx, sy)
  const hit = hitTestPuck(world.x, world.y, snapshotPucks(match), 0.35)
  selectedId = hit ? hit.id : null
}

function centerFromMinimap(sx: number, sy: number): void {
  const layout = minimapLayout(camera)
  if (!layout) return
  const w = minimapScreenToWorld(camera, layout, sx, sy)
  centerOn(camera, w.x, w.y)
}

type PointerState = {
  id: number
  startClientX: number
  startClientY: number
  lastClientX: number
  lastClientY: number
  moved: number
  onMinimap: boolean
}

const pointers = new Map<number, PointerState>()
let pinchStartDist = 0
let pinchStartScale = 1
let pinchLastMid: { x: number; y: number } | null = null

function activePointers(): PointerState[] {
  return [...pointers.values()]
}

function clientDist(a: PointerState, b: PointerState): number {
  return Math.hypot(a.lastClientX - b.lastClientX, a.lastClientY - b.lastClientY)
}

function midpointCanvas(a: PointerState, b: PointerState): { x: number; y: number } {
  return toCanvas(
    (a.lastClientX + b.lastClientX) / 2,
    (a.lastClientY + b.lastClientY) / 2,
  )
}

canvas.addEventListener('pointerdown', (ev) => {
  canvas.setPointerCapture(ev.pointerId)
  const c = toCanvas(ev.clientX, ev.clientY)
  const layout = minimapLayout(camera)
  const onMinimap = !!layout && minimapContains(layout, c.x, c.y)
  pointers.set(ev.pointerId, {
    id: ev.pointerId,
    startClientX: ev.clientX,
    startClientY: ev.clientY,
    lastClientX: ev.clientX,
    lastClientY: ev.clientY,
    moved: 0,
    onMinimap,
  })

  if (onMinimap) {
    centerFromMinimap(c.x, c.y)
    return
  }

  const pts = activePointers().filter((x) => !x.onMinimap)
  if (pts.length === 2) {
    pinchStartDist = clientDist(pts[0]!, pts[1]!)
    pinchStartScale = camera.scale
    pinchLastMid = midpointCanvas(pts[0]!, pts[1]!)
  }
})

canvas.addEventListener('pointermove', (ev) => {
  const p = pointers.get(ev.pointerId)
  if (!p) return

  const prevClientX = p.lastClientX
  const prevClientY = p.lastClientY
  p.lastClientX = ev.clientX
  p.lastClientY = ev.clientY
  p.moved = Math.hypot(
    ev.clientX - p.startClientX,
    ev.clientY - p.startClientY,
  )

  if (p.onMinimap) {
    const c = toCanvas(ev.clientX, ev.clientY)
    centerFromMinimap(c.x, c.y)
    return
  }

  const pts = activePointers().filter((x) => !x.onMinimap)
  if (pts.length === 2) {
    const [a, b] = pts
    const dist = clientDist(a!, b!)
    const mid = midpointCanvas(a!, b!)
    if (pinchStartDist > 0) {
      const targetScale = pinchStartScale * (dist / pinchStartDist)
      zoomAt(camera, mid.x, mid.y, targetScale / camera.scale)
    }
    if (pinchLastMid) {
      panByScreen(camera, mid.x - pinchLastMid.x, mid.y - pinchLastMid.y)
    }
    pinchLastMid = mid
    return
  }

  if (pts.length === 1 && p.moved >= TAP_SLOP_PX) {
    const rect = canvas.getBoundingClientRect()
    const dSx = (ev.clientX - prevClientX) * (canvas.width / rect.width)
    const dSy = (ev.clientY - prevClientY) * (canvas.height / rect.height)
    panByScreen(camera, dSx, dSy)
  }
})

function endPointer(ev: PointerEvent): void {
  const p = pointers.get(ev.pointerId)
  if (!p) return
  pointers.delete(ev.pointerId)

  if (!p.onMinimap && p.moved < TAP_SLOP_PX && activePointers().length === 0) {
    const c = toCanvas(ev.clientX, ev.clientY)
    selectAtCanvas(c.x, c.y)
  }

  const pts = activePointers().filter((x) => !x.onMinimap)
  if (pts.length === 2) {
    pinchStartDist = clientDist(pts[0]!, pts[1]!)
    pinchStartScale = camera.scale
    pinchLastMid = midpointCanvas(pts[0]!, pts[1]!)
  } else {
    pinchStartDist = 0
    pinchLastMid = null
  }
}

canvas.addEventListener('pointerup', endPointer)
canvas.addEventListener('pointercancel', endPointer)

canvas.addEventListener(
  'wheel',
  (ev) => {
    ev.preventDefault()
    const c = toCanvas(ev.clientX, ev.clientY)
    const layout = minimapLayout(camera)
    if (layout && minimapContains(layout, c.x, c.y)) return
    const factor = Math.exp(-ev.deltaY * 0.0015)
    zoomAt(camera, c.x, c.y, factor)
  },
  { passive: false },
)

function resize(): void {
  const stage = canvas.parentElement!
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = stage.clientWidth
  const h = stage.clientHeight
  canvas.width = Math.max(1, Math.floor(w * dpr))
  canvas.height = Math.max(1, Math.floor(h * dpr))
  setViewport(camera, canvas.width, canvas.height)
}

window.addEventListener('resize', resize)
resize()

function formatTime(t: number): string {
  const s = Math.floor(t)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

function updateStatus(): void {
  const counts = countTeams(match.world)
  const states = countStatesByTeam(match.world)
  const fmt = (s: typeof states.a) =>
    `H${s.Hunting} E${s.Engaged} R${s.Retreating} G${s.Regrouping} A${s.Advancing}`
  statusEl.innerHTML = `
    seed <strong>${seed}</strong>
    · ${formatTime(match.world.elapsed)}
    · charges <strong>${match.world.charges[0]}</strong>
    · <span class="team-a">A ${counts.a}</span>
    / <span class="team-b">B ${counts.b}</span>
    · ${modeLabel(mode)}
    <br />
    <span class="team-a">A ${fmt(states.a)}</span>
    · <span class="team-b">B ${fmt(states.b)}</span>
  `
}

function updateSpawnControls(): void {
  const tick = match.world.tick
  let pending = 0
  for (const input of match.inputs) {
    if (!input.applied && input.tick === tick) pending++
  }
  const available = match.world.charges[0] - pending
  const interval = data.tuning.chargeInterval
  const frac = Math.max(0, Math.min(1, match.world.chargeProgress[0] / interval))
  chargesEl.textContent = `Charges ${Math.max(0, available)}`
  chargeFill.style.width = `${frac * 100}%`
  const off = available < 1 || match.world.finished
  for (const btn of Object.values(spawnButtons)) btn.disabled = off
}

function updateInspect(): void {
  if (selectedId === null) {
    inspectEl.textContent = ''
    return
  }
  const p = snapshotPucks(match).find((x) => x.id === selectedId)
  if (!p) {
    inspectEl.textContent = ''
    selectedId = null
    return
  }
  const target =
    p.targetId !== null
      ? snapshotPucks(match).find((x) => x.id === p.targetId)
      : null
  const targetText = target
    ? `${target.glyph} #${target.id}`
    : p.targetId !== null
      ? `#${p.targetId}`
      : 'none'
  inspectEl.innerHTML = `
    <div><strong>${p.glyph}</strong> ${p.type}</div>
    <div>Team ${p.team === 0 ? 'A' : 'B'}</div>
    <div>HP ${p.hp.toFixed(1)} / ${p.maxHp}</div>
    <div>State ${p.stateName} (${p.timeInState.toFixed(1)}s)</div>
    <div>Target ${targetText}</div>
  `
}

function showEnd(result: NonNullable<ReturnType<typeof getMatchResult>>): void {
  const winnerText =
    result.winner === null
      ? 'Draw'
      : result.winner === 0
        ? 'Team A wins'
        : 'Team B wins'
  endEl.classList.remove('hidden')
  endEl.innerHTML = `
    <div class="end-card">
      <h2>${winnerText}</h2>
      <p>${formatTime(result.elapsed)}</p>
      <div class="detail">
        Spawned A ${result.spawnedA} · B ${result.spawnedB}<br />
        Lost A ${result.lostA} · B ${result.lostB}
      </div>
    </div>
  `
}

function frame(ts: number): void {
  const realDt = Math.min(0.05, (ts - lastTs) / 1000)
  lastTs = ts

  if (speed > 0 && !match.world.finished) {
    accumulator += realDt * speed
    const step = data.tuning.fixedDt
    let guard = 0
    while (accumulator >= step && guard < 12) {
      stepMatch(match)
      accumulator -= step
      guard++
      if (match.world.finished) {
        const result = getMatchResult(match)
        if (result) showEnd(result)
        break
      }
    }
  }

  const pucks = snapshotPucks(match)
  if (selectedId !== null && !pucks.some((p) => p.id === selectedId)) {
    selectedId = null
  }

  drawFrame(ctx, match, pucks, camera, selectedId)
  updateStatus()
  updateSpawnControls()
  updateInspect()
  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
