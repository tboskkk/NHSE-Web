export type Grey = { width: number; height: number; data: Uint8Array };
export type Ramp = { width: number; height: number; data: Uint8Array /* RGBA */ };

const OPACITY_CUTOFF = 100;

/** Which ramp row to use (summer only): the colour index, the greenest row (foliage), or row 0 (trunk). */
export function pickRow(ramp: Ramp, kind: "colour" | "foliage" | "trunk", colour: number | null): number {
  if (kind === "trunk") return 0;
  if (kind === "colour") return Math.min(Math.max(colour ?? 0, 0), ramp.height - 1);
  const x = Math.round((ramp.width - 1) / 2);
  let best = 0, bestScore = -Infinity;
  for (let y = 0; y < ramp.height; y++) {
    const o = (y * ramp.width + x) * 4;
    const score = ramp.data[o + 1]! - Math.max(ramp.data[o]!, ramp.data[o + 2]!);
    if (score > bestScore) { bestScore = score; best = y; }
  }
  return best;
}

/** One RGBA `size` x `size` cell: ramp colour looked up by the albedo's grey value at `row`, alpha from the opacity map. */
export function bakeCell(albedo: Grey | null, opacity: Grey | null, ramp: Ramp | null, row: number, size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const rampRow = ramp ? Math.min(Math.max(row, 0), ramp.height - 1) : 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const g = albedo ? albedo.data[Math.floor((y * albedo.height) / size) * albedo.width + Math.floor((x * albedo.width) / size)]! : 128;
      let rgb = [g, g, g];
      if (ramp) {
        const rx = Math.round((g / 255) * (ramp.width - 1));
        const o = (rampRow * ramp.width + rx) * 4;
        rgb = [ramp.data[o]!, ramp.data[o + 1]!, ramp.data[o + 2]!];
      }
      const a = opacity ? (opacity.data[Math.floor((y * opacity.height) / size) * opacity.width + Math.floor((x * opacity.width) / size)]! < OPACITY_CUTOFF ? 0 : 255) : 255;
      out.set([...rgb, a], (y * size + x) * 4);
    }
  }
  return out;
}

/** Cells side by side, left to right. */
export function atlas(cells: Uint8Array[], size: number): { width: number; height: number; data: Uint8Array } {
  const width = size * cells.length;
  const data = new Uint8Array(width * size * 4);
  cells.forEach((c, k) => {
    for (let y = 0; y < size; y++) data.set(c.subarray(y * size * 4, (y + 1) * size * 4), (y * width + k * size) * 4);
  });
  return { width, height: size, data };
}
