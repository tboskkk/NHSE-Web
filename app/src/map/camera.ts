/** World position shown at the screen origin, plus screen px per world px. Pure math; no DOM. */
export type Camera = { x: number; y: number; zoom: number };
export type Bounds = { w: number; h: number };
export type View = { w: number; h: number };

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;

const finite = (...n: number[]) => n.every(Number.isFinite);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const validView = (v: View) => v.w > 0 && v.h > 0;

function axis(pos: number, world: number, viewPx: number, zoom: number): number {
  const visible = viewPx / zoom;
  if (visible >= world) return (world - visible) / 2; // smaller than the view: centre it
  return clamp(pos, 0, world - visible);
}

/** Keeps the island on screen: clamps to the world, centring any axis the world does not fill. */
export function clampCamera(c: Camera, bounds: Bounds, view: View): Camera {
  if (!finite(c.x, c.y, c.zoom) || !validView(view)) return c;
  const zoom = clamp(c.zoom, MIN_ZOOM, MAX_ZOOM);
  return { x: axis(c.x, bounds.w, view.w, zoom), y: axis(c.y, bounds.h, view.h, zoom), zoom };
}

/** Zooms by `factor` keeping the world point under screen (sx, sy) fixed. */
export function zoomAt(c: Camera, factor: number, sx: number, sy: number, bounds: Bounds, view: View): Camera {
  if (!finite(c.x, c.y, c.zoom, factor, sx, sy) || !validView(view)) return c;
  const zoom = clamp(c.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  const wx = c.x + sx / c.zoom;
  const wy = c.y + sy / c.zoom;
  return clampCamera({ x: wx - sx / zoom, y: wy - sy / zoom, zoom }, bounds, view);
}

/** Pans by a screen-space drag delta (positive dx drags the map right). */
export function panBy(c: Camera, dx: number, dy: number, bounds: Bounds, view: View): Camera {
  if (!finite(c.x, c.y, c.zoom, dx, dy) || !validView(view)) return c;
  return clampCamera({ x: c.x - dx / c.zoom, y: c.y - dy / c.zoom, zoom: c.zoom }, bounds, view);
}
