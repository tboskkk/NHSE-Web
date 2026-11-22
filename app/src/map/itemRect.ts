import { isExtension, isNone, itemFootprint } from "@nhse/core";

/** Drawn size of a root item in px (footprint x tile size); null for empty and extension tiles. */
export function itemSpriteRect(raw: bigint, tileSize: number): { w: number; h: number } | null {
  if (isNone(raw) || isExtension(raw)) return null;
  const { w, h } = itemFootprint(raw);
  return { w: w * tileSize, h: h * tileSize };
}
