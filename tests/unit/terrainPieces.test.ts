import { expect, test } from "bun:test";
import { ANGLE_DIR, LEVEL_HEIGHT } from "../../app/src/map3d/constants";
import { groupTerrainPieces } from "../../app/src/map3d/terrainPieces";
import { emptyMap } from "./mapFixture";

const k = (tx: number, ty: number) => 96 * tx + ty; // terrain layer is column-major
const W = 144;
const set = (m: ReturnType<typeof emptyMap>, tx: number, ty: number, f: Partial<Record<"unitModel" | "variation" | "angle" | "roadModel" | "roadVariation" | "roadAngle" | "elevation", number>>) => {
  for (const [key, v] of Object.entries(f)) (m.terrain as unknown as Record<string, Uint16Array>)[key]![k(tx, ty)] = v!;
};

test("a river tile becomes a piece instance at its tile centre, height, rotation and marks only its tile replaced", () => {
  const m = emptyMap();
  set(m, 10, 10, { unitModel: 1, variation: 2, angle: 3, elevation: 1 });
  const r = groupTerrainPieces(m, new Map([["1_2", "River0A_2"]]));
  expect([...r.pieces.keys()]).toEqual(["River0A_2"]);
  const [i] = r.pieces.get("River0A_2")!;
  expect(i).toEqual({ x: (16 + 10) * 2 + 1, y: LEVEL_HEIGHT, z: (16 + 10) * 2 + 1, rotY: 3 * (Math.PI / 2) * ANGLE_DIR });
  expect(r.replaced.length).toBe(144 * 128);
  expect(r.replaced.reduce((a, b) => a + b, 0)).toBe(1);
  expect(r.replaced[(16 + 10) * W + 16 + 10]).toBe(1);
});

test("a variation with no piece falls back to variation 0; unknown units and unit 0 produce nothing", () => {
  const m = emptyMap();
  set(m, 3, 3, { unitModel: 5, variation: 3 });
  set(m, 4, 4, { unitModel: 99, variation: 0 }); // no piece for this unit
  const r = groupTerrainPieces(m, new Map([["5_0", "RiverX_0"]]));
  expect(r.pieces.get("RiverX_0")).toHaveLength(1);
  expect(r.replaced.reduce((a, b) => a + b, 0)).toBe(1);
  expect(groupTerrainPieces(emptyMap(), new Map([["0_0", "Base_0"]])).pieces.size).toBe(0); // unit 0 is never a piece
});

test("a road overlay draws its road piece on top of the tile without replacing it", () => {
  const m = emptyMap();
  set(m, 6, 7, { unitModel: 0, roadModel: 72, roadVariation: 1, roadAngle: 2, elevation: 0 });
  const r = groupTerrainPieces(m, new Map([["72_1", "RoadSoil1A_1"]]));
  expect(r.pieces.get("RoadSoil1A_1")).toHaveLength(1);
  expect(r.pieces.get("RoadSoil1A_1")![0]!.rotY).toBeCloseTo(2 * (Math.PI / 2) * ANGLE_DIR);
  expect(r.replaced.reduce((a, b) => a + b, 0)).toBe(0);
});

test("an empty terrain table yields no pieces and an all-zero mask", () => {
  const m = emptyMap();
  set(m, 10, 10, { unitModel: 1 });
  const r = groupTerrainPieces(m, new Map());
  expect(r.pieces.size).toBe(0);
  expect(r.replaced.every((x) => x === 0)).toBe(true);
});
