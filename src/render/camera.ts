/**
 * Spectator camera math. No imports from the sim — headless/determinism untouched.
 *
 * World: origin bottom-left, Y up, fixed arena size.
 * Screen: origin top-left, Y down.
 */

export type Camera = {
  /** Pixels per world unit. */
  scale: number
  /** World point at the viewport center. */
  cx: number
  cy: number
  viewportW: number
  viewportH: number
  arenaW: number
  arenaH: number
  /** Puck diameter in world units (2 × radius). */
  puckDiameter: number
  maxZoomInPucksAcross: number
}

export type Vec2 = { x: number; y: number }

export function createCamera(opts: {
  arenaW: number
  arenaH: number
  viewportW: number
  viewportH: number
  puckDiameter: number
  maxZoomInPucksAcross: number
}): Camera {
  const cam: Camera = {
    scale: 1,
    cx: opts.arenaW / 2,
    cy: opts.arenaH / 2,
    viewportW: opts.viewportW,
    viewportH: opts.viewportH,
    arenaW: opts.arenaW,
    arenaH: opts.arenaH,
    puckDiameter: opts.puckDiameter,
    maxZoomInPucksAcross: opts.maxZoomInPucksAcross,
  }
  cam.scale = zoomOutScale(cam)
  clampCamera(cam)
  return cam
}

/** Zoom-out limit: whole arena fits (letterboxed). */
export function zoomOutScale(cam: Camera): number {
  const { viewportW: vw, viewportH: vh, arenaW: aw, arenaH: ah } = cam
  if (vw <= 0 || vh <= 0 || aw <= 0 || ah <= 0) return 1
  return Math.min(vw / aw, vh / ah)
}

/**
 * Zoom-in limit: short side shows maxZoomInPucksAcross diameters.
 * If that would be wider than the fit view, equals zoom-out (no zoom range).
 */
export function zoomInScale(cam: Camera): number {
  const short = Math.min(cam.viewportW, cam.viewportH)
  const fit = zoomOutScale(cam)
  if (short <= 0 || cam.puckDiameter <= 0) return fit
  const candidate = short / (cam.maxZoomInPucksAcross * cam.puckDiameter)
  return candidate < fit ? fit : candidate
}

export function setViewport(cam: Camera, viewportW: number, viewportH: number): void {
  cam.viewportW = viewportW
  cam.viewportH = viewportH
  cam.scale = clamp(cam.scale, zoomOutScale(cam), zoomInScale(cam))
  clampCamera(cam)
}

export function isAtZoomOutLimit(cam: Camera, epsilon = 1e-6): boolean {
  return cam.scale <= zoomOutScale(cam) + epsilon
}

export function worldToScreen(cam: Camera, wx: number, wy: number): Vec2 {
  return {
    x: (wx - cam.cx) * cam.scale + cam.viewportW / 2,
    y: (cam.cy - wy) * cam.scale + cam.viewportH / 2,
  }
}

export function screenToWorld(cam: Camera, sx: number, sy: number): Vec2 {
  return {
    x: (sx - cam.viewportW / 2) / cam.scale + cam.cx,
    y: cam.cy - (sy - cam.viewportH / 2) / cam.scale,
  }
}

/** Visible world axis-aligned rect (Y-up). */
export function visibleWorldRect(cam: Camera): {
  x: number
  y: number
  w: number
  h: number
} {
  const w = cam.viewportW / cam.scale
  const h = cam.viewportH / cam.scale
  return {
    x: cam.cx - w / 2,
    y: cam.cy - h / 2,
    w,
    h,
  }
}

/**
 * Zoom by multiplying scale, keeping the world point under (anchorSx, anchorSy)
 * fixed on screen.
 */
export function zoomAt(
  cam: Camera,
  anchorSx: number,
  anchorSy: number,
  factor: number,
): void {
  if (!(factor > 0) || !Number.isFinite(factor)) return
  const before = screenToWorld(cam, anchorSx, anchorSy)
  cam.scale = clamp(
    cam.scale * factor,
    zoomOutScale(cam),
    zoomInScale(cam),
  )
  cam.cx = before.x - (anchorSx - cam.viewportW / 2) / cam.scale
  cam.cy = before.y + (anchorSy - cam.viewportH / 2) / cam.scale
  clampCamera(cam)
}

/** Pan by a screen-space delta (positive dSx moves content with the drag). */
export function panByScreen(cam: Camera, dSx: number, dSy: number): void {
  cam.cx -= dSx / cam.scale
  cam.cy += dSy / cam.scale
  clampCamera(cam)
}

export function centerOn(cam: Camera, wx: number, wy: number): void {
  cam.cx = wx
  cam.cy = wy
  clampCamera(cam)
}

export function clampCamera(cam: Camera): void {
  cam.scale = clamp(cam.scale, zoomOutScale(cam), zoomInScale(cam))

  const visW = cam.viewportW / cam.scale
  const visH = cam.viewportH / cam.scale

  if (cam.arenaW > visW) {
    const half = visW / 2
    cam.cx = clamp(cam.cx, half, cam.arenaW - half)
  } else {
    cam.cx = cam.arenaW / 2
  }

  if (cam.arenaH > visH) {
    const half = visH / 2
    cam.cy = clamp(cam.cy, half, cam.arenaH - half)
  } else {
    cam.cy = cam.arenaH / 2
  }
}

/** World units visible along the viewport short side, in puck diameters. */
export function pucksAcrossShortSide(cam: Camera): number {
  const short = Math.min(cam.viewportW, cam.viewportH)
  return short / cam.scale / cam.puckDiameter
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** Minimap layout in canvas pixels (bottom-right). */
export function minimapLayout(cam: Camera): {
  x: number
  y: number
  size: number
} | null {
  if (isAtZoomOutLimit(cam)) return null
  const short = Math.min(cam.viewportW, cam.viewportH)
  const size = short * 0.3
  const margin = Math.max(8, short * 0.02)
  return {
    x: cam.viewportW - margin - size,
    y: cam.viewportH - margin - size,
    size,
  }
}

export function minimapContains(
  layout: { x: number; y: number; size: number },
  sx: number,
  sy: number,
): boolean {
  return (
    sx >= layout.x &&
    sy >= layout.y &&
    sx <= layout.x + layout.size &&
    sy <= layout.y + layout.size
  )
}

/** Map minimap pixel to world (letterboxed arena inside the square). */
export function minimapScreenToWorld(
  cam: Camera,
  layout: { x: number; y: number; size: number },
  sx: number,
  sy: number,
): Vec2 {
  const localX = sx - layout.x
  const localY = sy - layout.y
  const fit = Math.min(layout.size / cam.arenaW, layout.size / cam.arenaH)
  const drawW = cam.arenaW * fit
  const drawH = cam.arenaH * fit
  const ox = (layout.size - drawW) / 2
  const oy = (layout.size - drawH) / 2
  const wx = (localX - ox) / fit
  const wy = cam.arenaH - (localY - oy) / fit
  return { x: wx, y: wy }
}
