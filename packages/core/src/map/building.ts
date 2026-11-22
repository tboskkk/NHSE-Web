export type BuildingInfo = {
  type: number;
  x: number;
  y: number;
  angle: number;
  bit: number;
  subType: number;
  typeArg: number;
  uniqueId: number;
};

export const BUILDING_SIZE = 0x14;
export const BUILDING_COUNT = 46;

export function readBuildings(d: Uint8Array, offset: number): BuildingInfo[] {
  const need = offset + BUILDING_COUNT * BUILDING_SIZE;
  if (offset < 0 || need > d.length) throw new RangeError(`buildings need ${need} bytes, buffer has ${d.length}`);
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  return Array.from({ length: BUILDING_COUNT }, (_, i) => {
    const o = offset + i * BUILDING_SIZE;
    return {
      type: dv.getUint16(o, true),
      x: dv.getUint16(o + 2, true),
      y: dv.getUint16(o + 4, true),
      angle: dv.getUint8(o + 6),
      bit: dv.getInt8(o + 7),
      subType: dv.getUint16(o + 8, true),
      typeArg: dv.getUint8(o + 10),
      uniqueId: dv.getUint16(o + 12, true),
    };
  });
}
