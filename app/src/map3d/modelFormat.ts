/** Natural-item model pack: manifest + binary geometry. Shared by the offline generator and the browser importer. */
/** `groups` (optional) split the index list by material for multi-texture pieces (terrain); UVs are raw and may tile outside 0..1. */
export type Geometry = {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  groups?: { start: number; count: number; material: number }[];
};
export type Manifest = {
  version: 1;
  items: Record<string, string>;
  /** `textures` (optional, non-empty) lists one texture per material group, in group-material order; `texture` is then the first of them. */
  models: Record<string, { geometry: string; texture: string; textures?: string[] }>;
  /** Terrain pieces: `"<unitId>_<variation>"` -> model key (optional; packs without it have no terrain pieces). */
  terrain?: Record<string, string>;
};

const MAGIC = 0x4c444d4e; // "NMDL"
const MAGIC_GROUPS = 0x32444d4e; // "NMD2": NMDL plus material groups after the indices
const HEADER = 12;

export function encodeGeometry(g: Geometry): Uint8Array {
  const vc = g.positions.length / 3;
  const groups = g.groups && g.groups.length > 0 ? g.groups : null;
  const out = new Uint8Array(HEADER + vc * 32 + g.indices.length * 4 + (groups ? 4 + groups.length * 12 : 0));
  const v = new DataView(out.buffer);
  v.setUint32(0, groups ? MAGIC_GROUPS : MAGIC, true);
  v.setUint32(4, vc, true);
  v.setUint32(8, g.indices.length, true);
  let o = HEADER;
  for (const a of [g.positions, g.normals, g.uvs]) for (const f of a) { v.setFloat32(o, f, true); o += 4; }
  for (const i of g.indices) { v.setUint32(o, i, true); o += 4; }
  if (groups) {
    v.setUint32(o, groups.length, true);
    o += 4;
    for (const gr of groups) { v.setUint32(o, gr.start, true); v.setUint32(o + 4, gr.count, true); v.setUint32(o + 8, gr.material, true); o += 12; }
  }
  return out;
}

export function decodeGeometry(b: Uint8Array): Geometry {
  if (b.length < HEADER) throw new Error("geometry truncated");
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const magic = v.getUint32(0, true);
  if (magic !== MAGIC && magic !== MAGIC_GROUPS) throw new Error("geometry has the wrong magic");
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
  let groups: Geometry["groups"];
  if (magic === MAGIC_GROUPS) {
    if (b.length < o + 4) throw new Error("geometry truncated");
    const gc = v.getUint32(o, true);
    o += 4;
    if (b.length < o + gc * 12) throw new Error("geometry truncated");
    groups = [];
    for (let i = 0; i < gc; i++, o += 12) {
      const start = v.getUint32(o, true), count = v.getUint32(o + 4, true), material = v.getUint32(o + 8, true);
      if (start + count > ic) throw new Error(`geometry group ${i} runs past the index list`);
      groups.push({ start, count, material });
    }
  }
  return groups ? { positions, normals, uvs, indices, groups } : { positions, normals, uvs, indices };
}

export function parseManifest(json: string): Manifest {
  const m = JSON.parse(json) as Partial<Manifest>;
  if (m.version !== 1) throw new Error(`unsupported model pack version ${String(m.version)}`);
  if (!m.items || typeof m.items !== "object") throw new Error("model pack manifest has no items");
  if (!m.models || typeof m.models !== "object") throw new Error("model pack manifest has no models");
  for (const [k, e] of Object.entries(m.models)) {
    if (typeof e?.geometry !== "string") throw new Error(`model ${k}: bad geometry path`);
    if (typeof e?.texture !== "string") throw new Error(`model ${k}: bad texture path`);
    if (e.textures !== undefined && (!Array.isArray(e.textures) || e.textures.length === 0 || e.textures.some((t) => typeof t !== "string"))) throw new Error(`model ${k}: bad textures list`);
  }
  if (m.terrain !== undefined) {
    if (typeof m.terrain !== "object" || m.terrain === null || Array.isArray(m.terrain)) throw new Error("model pack manifest has a bad terrain table");
    for (const [k, key] of Object.entries(m.terrain)) if (typeof key !== "string" || !(key in m.models)) throw new Error(`terrain entry ${k} does not name a model`);
  }
  return m as Manifest;
}
