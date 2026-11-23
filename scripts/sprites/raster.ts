/** Top-down software rasteriser: albedo only, nearest sampling, z-buffered on model height. */

export type Shape = { pos: number[]; uv: number[]; idx: number[] };
export type Texture = { rgba: Uint8Array; width: number; height: number };

/**
 * Model units per footprint tile. Measured over 40 Ftr models with known footprints: items that fill their
 * footprint (pergola, lighted display stand, round topiary) are exactly 5.0 units per tile wide.
 */
export const UNITS_PER_TILE = 5;

export function modelBounds(shapes: Shape[]): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
  let b: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;
  for (const s of shapes) {
    for (let i = 0; i + 2 < s.pos.length; i += 3) {
      const x = s.pos[i]!, z = s.pos[i + 2]!;
      b = b ? { minX: Math.min(b.minX, x), maxX: Math.max(b.maxX, x), minZ: Math.min(b.minZ, z), maxZ: Math.max(b.maxZ, z) } : { minX: x, maxX: x, minZ: z, maxZ: z };
    }
  }
  return b;
}

/**
 * RGBA `canvas.w` x `canvas.h` px. Screen x = model x, screen y = model z, higher y is nearer.
 * `pxPerUnit` is real scale; a model that would overflow the canvas is scaled down uniformly (never up) and centred.
 */
export function renderTop(shapes: Shape[], tex: Texture, canvas: { w: number; h: number }, pxPerUnit: number): Uint8Array | null {
  const b = modelBounds(shapes);
  const { w, h } = canvas;
  if (!b || w <= 0 || h <= 0) return null;
  const ex = b.maxX - b.minX, ez = b.maxZ - b.minZ;
  if (!(ex > 0) || !(ez > 0)) return null;
  const scale = pxPerUnit * Math.min(1, w / (ex * pxPerUnit), h / (ez * pxPerUnit));
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  const out = new Uint8Array(w * h * 4);
  const zb = new Float32Array(w * h).fill(Infinity);
  for (const s of shapes) {
    const n = s.pos.length / 3;
    const sx = new Float32Array(n), sy = new Float32Array(n), dz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      sx[i] = (s.pos[i * 3]! - cx) * scale + w / 2;
      sy[i] = (s.pos[i * 3 + 2]! - cz) * scale + h / 2;
      dz[i] = -s.pos[i * 3 + 1]!;
    }
    for (let t = 0; t + 2 < s.idx.length; t += 3) {
      const a = s.idx[t]!, bi = s.idx[t + 1]!, c = s.idx[t + 2]!;
      const den = (sy[bi]! - sy[c]!) * (sx[a]! - sx[c]!) + (sx[c]! - sx[bi]!) * (sy[a]! - sy[c]!);
      if (Math.abs(den) < 1e-9) continue;
      const x0 = Math.max(0, Math.floor(Math.min(sx[a]!, sx[bi]!, sx[c]!))), x1 = Math.min(w - 1, Math.ceil(Math.max(sx[a]!, sx[bi]!, sx[c]!)));
      const y0 = Math.max(0, Math.floor(Math.min(sy[a]!, sy[bi]!, sy[c]!))), y1 = Math.min(h - 1, Math.ceil(Math.max(sy[a]!, sy[bi]!, sy[c]!)));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const gx = x + 0.5, gy = y + 0.5;
          const w0 = ((sy[bi]! - sy[c]!) * (gx - sx[c]!) + (sx[c]! - sx[bi]!) * (gy - sy[c]!)) / den;
          const w1 = ((sy[c]! - sy[a]!) * (gx - sx[c]!) + (sx[a]! - sx[c]!) * (gy - sy[c]!)) / den;
          const w2 = 1 - w0 - w1;
          if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
          const z = w0 * dz[a]! + w1 * dz[bi]! + w2 * dz[c]!;
          if (z >= zb[y * w + x]!) continue;
          const u = (w0 * s.uv[a * 2]! + w1 * s.uv[bi * 2]! + w2 * s.uv[c * 2]!) / 65535;
          const v = (w0 * s.uv[a * 2 + 1]! + w1 * s.uv[bi * 2 + 1]! + w2 * s.uv[c * 2 + 1]!) / 65535;
          const tx = Math.min(tex.width - 1, Math.max(0, Math.floor(u * tex.width)));
          const ty = Math.min(tex.height - 1, Math.max(0, Math.floor(v * tex.height)));
          const texel = tex.rgba.subarray((ty * tex.width + tx) * 4, (ty * tex.width + tx) * 4 + 4);
          if (texel[3] === 0) continue;
          zb[y * w + x] = z;
          out.set(texel, (y * w + x) * 4);
        }
      }
    }
  }
  return out;
}
