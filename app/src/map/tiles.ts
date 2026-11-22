import type { Camera } from "./camera";

/** A tile grid placed in world px: `tileSize` world px per tile, top-left at (originX, originY). */
export type GridSpec = { tileSize: number; width: number; height: number; originX: number; originY: number };

/** Tile under a screen point, or null outside the grid (or for non-finite input). */
export function screenToTile(c: Camera, sx: number, sy: number, g: GridSpec): { x: number; y: number } | null {
  if (![c.x, c.y, c.zoom, sx, sy].every(Number.isFinite) || c.zoom === 0) return null;
  const x = Math.floor((c.x + sx / c.zoom - g.originX) / g.tileSize);
  const y = Math.floor((c.y + sy / c.zoom - g.originY) / g.tileSize);
  return x >= 0 && y >= 0 && x < g.width && y < g.height ? { x, y } : null;
}

/** World position of a tile's top-left corner. */
export function tileToWorld(g: GridSpec, x: number, y: number): { x: number; y: number } {
  return { x: g.originX + x * g.tileSize, y: g.originY + y * g.tileSize };
}
