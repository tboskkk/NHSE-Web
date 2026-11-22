/** Structure-of-arrays terrain layer: 14-byte `TerrainTile` records, column-major (index = height*x + y). */
export type TerrainLayer = {
  width: number;
  height: number;
  unitModel: Uint16Array;
  variation: Uint16Array;
  angle: Uint16Array;
  roadModel: Uint16Array;
  roadVariation: Uint16Array;
  roadAngle: Uint16Array;
  elevation: Uint16Array;
};

export const TERRAIN_TILE_SIZE = 0xe;

export function readTerrain(d: Uint8Array, offset: number, width: number, height: number): TerrainLayer {
  const n = width * height;
  const need = offset + n * TERRAIN_TILE_SIZE;
  if (offset < 0 || need > d.length) throw new RangeError(`terrain needs ${need} bytes, buffer has ${d.length}`);
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const mk = () => new Uint16Array(n);
  const t: TerrainLayer = {
    width, height, unitModel: mk(), variation: mk(), angle: mk(), roadModel: mk(), roadVariation: mk(), roadAngle: mk(), elevation: mk(),
  };
  for (let i = 0; i < n; i++) {
    const o = offset + i * TERRAIN_TILE_SIZE;
    t.unitModel[i] = dv.getUint16(o, true);
    t.variation[i] = dv.getUint16(o + 2, true);
    t.angle[i] = dv.getUint16(o + 4, true);
    t.roadModel[i] = dv.getUint16(o + 6, true);
    t.roadVariation[i] = dv.getUint16(o + 8, true);
    t.roadAngle[i] = dv.getUint16(o + 10, true);
    t.elevation[i] = dv.getUint16(o + 12, true);
  }
  return t;
}
