export type Tool = "place" | "erase" | "rect" | "clearRect" | "eyedropper" | "building" | "terrain";
export type Tile = { x: number; y: number };

export type ToolGroup = "items" | "structures" | "terrain";
/** Toolbar order, labels, hotkeys and one-line hints for every tool. */
export const TOOL_INFO: { id: Tool; label: string; key: string; group: ToolGroup; hint: string }[] = [
  { id: "place", label: "Place", key: "p", group: "items", hint: "Place the brush item; drag to lay a row" },
  { id: "erase", label: "Erase", key: "e", group: "items", hint: "Remove items" },
  { id: "rect", label: "Fill area", key: "r", group: "items", hint: "Drag a rectangle to fill it with the brush" },
  { id: "clearRect", label: "Clear area", key: "c", group: "items", hint: "Drag a rectangle to clear it" },
  { id: "eyedropper", label: "Pick", key: "i", group: "items", hint: "Copy the item under the pointer into the brush" },
  { id: "building", label: "Buildings", key: "b", group: "structures", hint: "Select, move and add buildings and the plaza" },
  { id: "terrain", label: "Terrain", key: "t", group: "terrain", hint: "Stamp, raise, lower and rotate terrain tiles" },
];

export const toolForKey = (key: string): Tool | null => TOOL_INFO.find((t) => t.key === key.toLowerCase())?.id ?? null;
/** The item layer chooser only matters for the item tools. */
export const usesLayer = (t: Tool): boolean => TOOL_INFO.find((x) => x.id === t)?.group === "items";
export type Rect = { x0: number; y0: number; x1: number; y1: number };
export type StrokeResult = { tool: Tool; layer: 0 | 1; tiles: Tile[]; rect: Rect | null };

export interface Stroke {
  add(x: number, y: number): void;
  tiles(): Tile[];
  /** Normalized rectangle between the first and the latest tile (rect tools only). */
  rect(): Rect | null;
  /** The finished gesture, or null if nothing was touched. */
  done(): StrokeResult | null;
}

const isRect = (t: Tool) => t === "rect" || t === "clearRect";

/**
 * Collects one gesture. Place strokes only keep tiles outside the footprint (`size`, in item tiles) of an earlier
 * stamp, so a drag lays items edge to edge instead of piling overlapping stamps.
 */
export function createStroke(tool: Tool, layer: 0 | 1, size: { w: number; h: number } = { w: 1, h: 1 }): Stroke {
  const tiles: Tile[] = [];
  let first: Tile | null = null;
  let last: Tile | null = null;
  const rect = (): Rect | null =>
    first && last ? { x0: Math.min(first.x, last.x), y0: Math.min(first.y, last.y), x1: Math.max(first.x, last.x), y1: Math.max(first.y, last.y) } : null;

  return {
    add(x, y) {
      first ??= { x, y };
      last = { x, y };
      if (isRect(tool)) return;
      if (tool === "eyedropper") {
        tiles[0] = { x, y };
        return;
      }
      const prev = tiles[tiles.length - 1];
      if (prev && prev.x === x && prev.y === y) return;
      if (tool === "place" && tiles.some((t) => x - t.x < size.w && t.x - x < size.w && y - t.y < size.h && t.y - y < size.h)) return;
      tiles.push({ x, y });
    },
    tiles: () => tiles.slice(),
    rect,
    done() {
      if (isRect(tool)) {
        const r = rect();
        return r ? { tool, layer, tiles: [], rect: r } : null;
      }
      return tiles.length ? { tool, layer, tiles: tiles.slice(), rect: null } : null;
    },
  };
}
