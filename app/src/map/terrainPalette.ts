/** Terrain colors (0xRRGGBB). One table so the look is easy to tweak. Unit model ranges mirror upstream TerrainUnitModel. */
export type UnitClass = "base" | "river" | "cliff" | "fall" | "road" | "other";

export const OCEAN_RGBA = [0x80, 0xd7, 0xc3, 0xff] as const; // upstream TerrainSprite.ColorOcean

export function classifyUnit(m: number): UnitClass {
  if (m === 0) return "base";
  if (m >= 0x01 && m <= 0x15) return "river";
  if ((m >= 0x16 && m <= 0x29) || m === 0x93) return "cliff";
  if ((m >= 0x3a && m <= 0x46) || (m >= 0x71 && m <= 0x92)) return "fall";
  if ((m >= 0x47 && m <= 0x70) || m >= 0x94) return "road";
  return "other";
}

export const PALETTE = {
  grass: [70, 120, 64],
  river: [100, 190, 205],
  fall: [160, 225, 235],
  cliff: [118, 122, 132],
  other: [255, 0, 255],
  // road materials, by 20-model blocks starting at these unit model ids
  road: { soil: [150, 110, 70], stone: [170, 170, 170], brick: [176, 92, 76], darkSoil: [100, 75, 55], pattern: [200, 180, 140], sand: [240, 230, 170], tile: [210, 200, 190], wood: [160, 110, 70] },
} as const;

const ROAD_BLOCKS: [number, number, keyof typeof PALETTE.road][] = [
  [0x47, 0x5b, "soil"], [0x5c, 0x70, "stone"], [0x94, 0xa8, "brick"], [0xa9, 0xbd, "darkSoil"],
  [0xbe, 0xd2, "pattern"], [0xd3, 0xe7, "sand"], [0xe8, 0xfc, "tile"], [0xfd, 0x111, "wood"],
];

const pack = (c: readonly number[]) => (c[0]! << 16) | (c[1]! << 8) | c[2]!;
/** Each elevation level lightens land by 6% (monotonic, clamped). */
const shade = (c: readonly number[], elevation: number) => {
  const f = 1 + 0.06 * Math.min(elevation, 8);
  return pack(c.map((v) => Math.min(255, Math.round(v * f))));
};

export function roadColor(road: number): number | null {
  for (const [lo, hi, k] of ROAD_BLOCKS) if (road >= lo && road <= hi) return pack(PALETTE.road[k]);
  return null;
}

/** Color of a dynamic (terrain-based) tile: road layer over the base model, shaded by elevation. */
export function terrainColor(model: number, elevation: number, road: number): number {
  const r = road ? roadColor(road) : null;
  if (r !== null) return r;
  switch (classifyUnit(model)) {
    case "base": return shade(PALETTE.grass, elevation);
    case "river": return pack(PALETTE.river);
    case "fall": return pack(PALETTE.fall);
    case "cliff": return shade(PALETTE.cliff, elevation);
    case "road": return roadColor(model) ?? pack(PALETTE.other);
    default: return pack(PALETTE.other);
  }
}
