import './style.css'
import { createV0Behavior } from './behavior/v0.ts'
import {
  countTeams,
  createMatch,
  getMatchResult,
  loadGameData,
  randomSeed,
  snapshotPucks,
  stepMatch,
  type CombatMode,
  type Match,
} from './sim/index.ts'
import {
  computeView,
  drawFrame,
  hitTestPuck,
  modeLabel,
  screenToWorld,
} from './render/draw.ts'

const data = loadGameData()
const behavior = createV0Behavior({
  types: data.types,
  damage: data.damage,
  tuning: data.tuning,
})

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

setSeedInUrl(seed)

function makeMatch(s: number, m: CombatMode): Match {
  return createMatch({
    types: data.types,
    damage: data.damage,
    roster: data.roster,
    tuning: data.tuning,
    mode: m,
    seed: s,
    behavior,
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

canvas.addEventListener('pointerdown', (ev) => {
  const rect = canvas.getBoundingClientRect()
  const sx = ((ev.clientX - rect.left) / rect.width) * canvas.width
  const sy = ((ev.clientY - rect.top) / rect.height) * canvas.height
  const view = currentView()
  const world = screenToWorld(sx, sy, view, data.tuning.arenaHeight)
  const hit = hitTestPuck(world.x, world.y, snapshotPucks(match), 0.35)
  selectedId = hit ? hit.id : null
})

function currentView() {
  return computeView(
    canvas.width,
    canvas.height,
    data.tuning.arenaWidth,
    data.tuning.arenaHeight,
  )
}

function resize(): void {
  const stage = canvas.parentElement!
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = stage.clientWidth
  const h = stage.clientHeight
  canvas.width = Math.max(1, Math.floor(w * dpr))
  canvas.height = Math.max(1, Math.floor(h * dpr))
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
  const noHit = match.world.timeSinceHit
  const timeout = data.tuning.stalemateTimeout
  statusEl.innerHTML = `
    seed <strong>${seed}</strong>
    · ${formatTime(match.world.elapsed)}
    · <span class="team-a">A ${counts.a}</span>
    / <span class="team-b">B ${counts.b}</span>
    · no-hit ${noHit.toFixed(1)}/${timeout}s
    · ${modeLabel(mode)}
  `
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
  inspectEl.innerHTML = `
    <div><strong>${p.glyph}</strong> ${p.type}</div>
    <div>Team ${p.team === 0 ? 'A' : 'B'}</div>
    <div>HP ${p.hp.toFixed(1)} / ${p.maxHp}</div>
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
      <p>${result.reason === 'elimination' ? 'Elimination' : 'Stalemate'}</p>
      <div class="detail">
        ${formatTime(result.elapsed)}
        · A ${result.survivorsA} (HP ${result.totalHpA.toFixed(0)})
        · B ${result.survivorsB} (HP ${result.totalHpB.toFixed(0)})
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

  drawFrame(ctx, match, pucks, currentView(), selectedId)
  updateStatus()
  updateInspect()
  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
