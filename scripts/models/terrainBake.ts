import { bakeColourCell, type Grey } from "./bake";
import type { DecodedTexture } from "../sprites/bntx";

export type TexLookup = (name: string) => DecodedTexture | null;

/** Summer grass: the `mGrass_Grd` ramp pixel at this row and at this fraction of the width. Rows are seasons (0-15 snow, 16-39 spring/early summer yellow-green, 40-63 summer greens, 64+ autumn); row 56 is a lush green close to the flat ground colour. */
export const GRASS = { row: 56, column: 0.6 };
const WATERFALL_RGB = [150, 210, 235];
const OPACITY_CUTOFF = 100;
const MAGENTA = [255, 0, 255];

const solid = (rgb: number[], size: number, alpha = 255) => {
  const out = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) out.set([rgb[0]!, rgb[1]!, rgb[2]!, alpha], i * 4);
  return out;
};
const asGrey = (d: DecodedTexture): Grey => ({ width: d.width, height: d.height, data: d.data });

function meanColour(d: DecodedTexture): number[] {
  const n = d.width * d.height;
  const sum = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) sum[k]! += d.data[i * 4 + k]!;
  return sum.map((s) => Math.round(s / n));
}

/** One RGBA `size` x `size` atlas cell for a terrain piece material (rules in the plan's Global Constraints); `known` is false for the magenta fallback. */
export function bakeTerrainMaterial(material: string, tex: TexLookup, size: number): { cell: Uint8Array; known: boolean } {
  const colour = (name: string) => {
    const t = tex(name);
    return t && t.channels === 4 ? { cell: bakeColourCell(t, null, size), known: true } : null;
  };
  const fallback = { cell: solid(MAGENTA, size), known: false };

  if (/^m(Proc)?Grass/.test(material)) {
    const g = tex("mGrass_Grd");
    if (!g || g.channels !== 4) return { cell: solid([90, 150, 70], size), known: false };
    const x = Math.round(GRASS.column * (g.width - 1)), y = Math.min(GRASS.row, g.height - 1);
    const o = (y * g.width + x) * 4;
    const rgb = [g.data[o]!, g.data[o + 1]!, g.data[o + 2]!];
    const op = tex(`${material}_OP`);
    if (!op || op.channels !== 1) return { cell: solid(rgb, size), known: true };
    const out = solid(rgb, size);
    const grey = asGrey(op);
    for (let py = 0; py < size; py++)
      for (let px = 0; px < size; px++) out[(py * size + px) * 4 + 3] = grey.data[Math.floor((py * grey.height) / size) * grey.width + Math.floor((px * grey.width) / size)]! < OPACITY_CUTOFF ? 0 : 255;
    return { cell: out, known: true };
  }
  if (material === "mCliff" || material === "mRiver2Cliff") return colour("mCliff_Alb") ?? fallback;
  if (material === "mRiver") return colour("mRiver_Alb") ?? fallback;
  if (material === "mWaterfall") return { cell: solid(WATERFALL_RGB, size), known: true };
  if (/^mRoad/.test(material)) {
    const c = colour(`${material}_Alb`);
    if (c) return c;
    const ramp = tex(`${material}_Grd`);
    return ramp && ramp.channels === 4 ? { cell: solid(meanColour(ramp), size), known: true } : fallback;
  }
  return fallback;
}
