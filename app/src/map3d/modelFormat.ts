/** Natural-item model pack: manifest + binary geometry. Shared by the offline generator and the browser importer. */
export type Geometry = { positions: Float32Array; normals: Float32Array; uvs: Float32Array; indices: Uint32Array };
export type Manifest = { version: 1; items: Record<string, string>; models: Record<string, { geometry: string; texture: string }> };

const MAGIC = 0x4c444d4e; // "NMDL"
const HEADER = 12;

export function encodeGeometry(g: Geometry): Uint8Array {
  const vc = g.positions.length / 3;
  const out = new Uint8Array(HEADER + vc * 32 + g.indices.length * 4);
  const v = new DataView(out.buffer);
  v.setUint32(0, MAGIC, true);
  v.setUint32(4, vc, true);
  v.setUint32(8, g.indices.length, true);
  let o = HEADER;
  for (const a of [g.positions, g.normals, g.uvs]) for (const f of a) { v.setFloat32(o, f, true); o += 4; }
  for (const i of g.indices) { v.setUint32(o, i, true); o += 4; }
  return out;
}

export function decodeGeometry(b: Uint8Array): Geometry {
  if (b.length < HEADER) throw new Error("geometry truncated");
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (v.getUint32(0, true) !== MAGIC) throw new Error("geometry has the wrong magic");
  const vc = v.getUint32(4, true), ic = v.getUint32(8, true);
  if (b.length < HEADER + vc * 32 + ic * 4) throw new Error("geometry truncated");
  let o = HEADER;
  const floats = (n: number) => { const a = new Float32Array(n); for (let i = 0; i < n; i++, o += 4) a[i] = v.getFloat32(o, true); return a; };
  const positions = floats(vc * 3), normals = floats(vc * 3), uvs = floats(vc * 2);
  const indices = new Uint32Array(ic);
  for (let i = 0; i < ic; i++, o += 4) {
    indices[i] = v.getUint32(o, true);
    if (indices[i]! >= vc) throw new Error(`geometry index ${indices[i]} is out of range (${vc} vertices)`);
  }
  return { positions, normals, uvs, indices };
}

export function parseManifest(json: string): Manifest {
  const m = JSON.parse(json) as Partial<Manifest>;
  if (m.version !== 1) throw new Error(`unsupported model pack version ${String(m.version)}`);
  if (!m.items || typeof m.items !== "object") throw new Error("model pack manifest has no items");
  if (!m.models || typeof m.models !== "object") throw new Error("model pack manifest has no models");
  for (const [k, e] of Object.entries(m.models)) {
    if (typeof e?.geometry !== "string") throw new Error(`model ${k}: bad geometry path`);
    if (typeof e?.texture !== "string") throw new Error(`model ${k}: bad texture path`);
  }
  return m as Manifest;
}
