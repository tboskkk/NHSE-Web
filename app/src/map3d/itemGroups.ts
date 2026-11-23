import { isExtension, isNone, itemFootprint, type MapData } from "@nhse/core";
import type { SpriteSource } from "../map/spriteSource";
import { heightAt, type TileField } from "./terrainMesh";

export type Instance = { x: number; y: number; z: number; w: number; h: number };
export type ItemGroups = { flat: Map<string, Instance[]>; upright: Map<string, Instance[]> };

const ACRE = 32;

/**
 * Visible item roots grouped by sprite url. Imported (top-down) pack sprites lie flat over the footprint;
 * bundled icons and the leaf stand upright as squares. Positions are world units (item tiles), centred on the footprint.
 */
export function groupItems(map: MapData, f: TileField, sprites: SpriteSource): ItemGroups {
  const out: ItemGroups = { flat: new Map(), upright: new Map() };
  for (const layer of map.items) {
    const originX = ((9 - layer.width / ACRE) / 2) * ACRE;
    for (let x = 0; x < layer.width; x++) {
      for (let y = 0; y < layer.height; y++) {
        const raw = layer.raw[layer.height * x + y]!;
        if (isNone(raw) || isExtension(raw)) continue;
        const fp = itemFootprint(raw);
        const cx = originX + x + fp.w / 2, cz = ACRE + y + fp.h / 2;
        const ground = heightAt(f, cx, cz);
        const ref = sprites.resolve(Number(raw & 0xffffn), Number((raw >> 32n) & 0xffffn));
        const flat = ref.kind === "pack";
        const side = Math.max(fp.w, fp.h);
        const inst: Instance = flat ? { x: cx, y: ground + 0.05, z: cz, w: fp.w, h: fp.h } : { x: cx, y: ground, z: cz, w: side, h: side };
        const groups = flat ? out.flat : out.upright;
        const list = groups.get(ref.url);
        if (list) list.push(inst);
        else groups.set(ref.url, [inst]);
      }
    }
  }
  return out;
}
