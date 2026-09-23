import { describe, expect, it } from 'vitest'
import {
  clampCamera,
  createCamera,
  pucksAcrossShortSide,
  screenToWorld,
  worldToScreen,
  zoomAt,
  zoomInScale,
  zoomOutScale,
  type Camera,
} from '../src/render/camera.ts'

const ARENA = { arenaW: 16, arenaH: 25, puckDiameter: 1, maxZoomInPucksAcross: 16 }

function camAt(vw: number, vh: number): Camera {
  return createCamera({ ...ARENA, viewportW: vw, viewportH: vh })
}

describe('camera fit zoom', () => {
  it('computes fit for portrait, landscape, and square', () => {
    const portrait = camAt(390, 844)
    expect(zoomOutScale(portrait)).toBeCloseTo(Math.min(390 / 16, 844 / 25), 10)

    const landscape = camAt(1440, 900)
    expect(zoomOutScale(landscape)).toBeCloseTo(Math.min(1440 / 16, 900 / 25), 10)

    const square = camAt(800, 800)
    expect(zoomOutScale(square)).toBeCloseTo(Math.min(800 / 16, 800 / 25), 10)
  })
})

describe('camera zoom limits', () => {
  it('respects zoom-in and collapses when no zoom is available', () => {
    // 390×844: fit uses width; zoom-in candidate equals fit → no range.
    const phone = camAt(390, 844)
    expect(zoomInScale(phone)).toBeCloseTo(zoomOutScale(phone), 10)
    expect(phone.scale).toBeCloseTo(zoomOutScale(phone), 10)
    zoomAt(phone, 195, 422, 2)
    expect(phone.scale).toBeCloseTo(zoomOutScale(phone), 10)

    const desk = camAt(1440, 900)
    expect(zoomInScale(desk)).toBeGreaterThan(zoomOutScale(desk))
    desk.scale = zoomInScale(desk)
    clampCamera(desk)
    expect(pucksAcrossShortSide(desk)).toBeCloseTo(16, 5)
  })
})

describe('camera zoom anchor', () => {
  it('keeps the world point under the anchor fixed after zoom (pre-clamp)', () => {
    const cam = camAt(1440, 900)
    cam.scale = (zoomOutScale(cam) + zoomInScale(cam)) / 2
    cam.cx = 8
    cam.cy = 12.5
    // Skip clamp so we isolate the anchor math; clamp is tested separately.
    const ax = 400
    const ay = 300
    const before = screenToWorld(cam, ax, ay)
    const next = clamp(
      cam.scale * 1.25,
      zoomOutScale(cam),
      zoomInScale(cam),
    )
    cam.scale = next
    cam.cx = before.x - (ax - cam.viewportW / 2) / cam.scale
    cam.cy = before.y + (ay - cam.viewportH / 2) / cam.scale
    const after = screenToWorld(cam, ax, ay)
    expect(after.x).toBeCloseTo(before.x, 8)
    expect(after.y).toBeCloseTo(before.y, 8)
  })

  it('zoomAt preserves anchor when clamp does not need to move the camera', () => {
    const cam = camAt(1440, 900)
    cam.scale = (zoomOutScale(cam) + zoomInScale(cam)) / 2
    cam.cx = 8
    cam.cy = 12.5
    clampCamera(cam)
    const ax = cam.viewportW / 2
    const ay = cam.viewportH / 2
    const before = screenToWorld(cam, ax, ay)
    zoomAt(cam, ax, ay, 1.1)
    const after = screenToWorld(cam, ax, ay)
    expect(after.x).toBeCloseTo(before.x, 6)
    expect(after.y).toBeCloseTo(before.y, 6)
  })
})

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

describe('camera clamping', () => {
  it('centers when arena is smaller than the viewport on an axis', () => {
    const cam = camAt(1440, 900)
    // At fit, arena fits on both axes → centered, no pan.
    cam.cx = 0
    cam.cy = 0
    clampCamera(cam)
    expect(cam.cx).toBeCloseTo(8, 10)
    expect(cam.cy).toBeCloseTo(12.5, 10)
  })

  it('clamps the scrollable axis and centers the smaller axis when zoomed in', () => {
    const cam = camAt(1440, 900)
    cam.scale = zoomInScale(cam)
    // At max zoom-in, short side (900) shows 16 diameters → visH=16 < arena 25 (pan Y).
    // visW = 1440/scale > 16 → arena smaller on X → centered, no pan X.
    cam.cx = -100
    cam.cy = -100
    clampCamera(cam)
    const visW = cam.viewportW / cam.scale
    const visH = cam.viewportH / cam.scale
    expect(visW).toBeGreaterThan(cam.arenaW)
    expect(visH).toBeLessThan(cam.arenaH)
    expect(cam.cx).toBeCloseTo(cam.arenaW / 2, 10)
    expect(cam.cy).toBeGreaterThanOrEqual(visH / 2 - 1e-9)
    expect(cam.cy).toBeLessThanOrEqual(cam.arenaH - visH / 2 + 1e-9)

    cam.cy = 999
    clampCamera(cam)
    expect(cam.cy).toBeLessThanOrEqual(cam.arenaH - visH / 2 + 1e-9)
  })
})

describe('camera round trip', () => {
  it('screen-to-world and world-to-screen round trip', () => {
    const cam = camAt(1440, 900)
    cam.scale = (zoomOutScale(cam) + zoomInScale(cam)) / 2
    cam.cx = 10
    cam.cy = 15
    clampCamera(cam)
    const samples = [
      { x: 0, y: 0 },
      { x: 8, y: 12.5 },
      { x: 16, y: 25 },
      { x: 3.3, y: 19.7 },
    ]
    for (const w of samples) {
      const s = worldToScreen(cam, w.x, w.y)
      const back = screenToWorld(cam, s.x, s.y)
      expect(back.x).toBeCloseTo(w.x, 8)
      expect(back.y).toBeCloseTo(w.y, 8)
    }
  })
})
