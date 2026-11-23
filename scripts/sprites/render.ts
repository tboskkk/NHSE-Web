import { itemFootprint } from "../../packages/core/src";
import { albedo, type BntxTexture } from "./bntx";
import { encodePng } from "./png";
import { modelBounds, renderTop, type Shape, UNITS_PER_TILE } from "./raster";

export const PX_PER_TILE = 32;

export type Deps = {
  loadModel(model: string): Promise<Shape[]>;
  loadTextures(model: string, variant: number): Promise<BntxTexture[]>;
};

/** One sprite: footprint-shaped canvas at 32 px per tile; throws a short reason when the item cannot be rendered. */
export async function renderVariant(deps: Deps, item: { id: number; model: string }, variant: number): Promise<{ png: Uint8Array; albCount: number }> {
  const shapes = await deps.loadModel(item.model);
  const bounds = modelBounds(shapes);
  if (!bounds) throw new Error("no mesh");
  const tex = albedo(await deps.loadTextures(item.model, variant));
  const fp = itemFootprint(BigInt(item.id));
  const tiles = fp.unknownSize
    ? { w: Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / UNITS_PER_TILE - 1e-9)), h: Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / UNITS_PER_TILE - 1e-9)) }
    : { w: fp.w, h: fp.h };
  const canvas = { w: tiles.w * PX_PER_TILE, h: tiles.h * PX_PER_TILE };
  const rgba = renderTop(shapes, tex, canvas, PX_PER_TILE / UNITS_PER_TILE);
  if (!rgba) throw new Error("no mesh");
  return { png: encodePng(canvas.w, canvas.h, rgba), albCount: tex.albCount };
}
