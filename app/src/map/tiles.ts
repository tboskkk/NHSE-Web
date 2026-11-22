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

export type TileRange = { x0: number; y0: number; x1: number; y1: number };

/** Inclusive range of tiles overlapping the view, clamped to the grid; empty (x1 < x0) when off-grid or non-finite. */
export function visibleTileRange(c: Camera, view: { w: number; h: number }, g: GridSpec): TileRange {
  const empty = { x0: 0, y0: 0, x1: -1, y1: -1 };
  if (![c.x, c.y, c.zoom, view.w, view.h].every(Number.isFinite) || c.zoom <= 0) return empty;
  const x0 = Math.max(0, Math.floor((c.x - g.originX) / g.tileSize));
  const y0 = Math.max(0, Math.floor((c.y - g.originY) / g.tileSize));
  const x1 = Math.min(g.width - 1, Math.floor((c.x + view.w / c.zoom - g.originX) / g.tileSize));
  const y1 = Math.min(g.height - 1, Math.floor((c.y + view.h / c.zoom - g.originY) / g.tileSize));
  return x1 < x0 || y1 < y0 ? empty : { x0, y0, x1, y1 };
}
