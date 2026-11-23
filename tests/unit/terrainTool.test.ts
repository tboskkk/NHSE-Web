import { expect, test } from "bun:test";
import { clearRoadOp, elevationOp, rotateOp, stampOp, terrainTileUnder } from "../../app/src/map/terrainTool";
import { emptyMap } from "./mapFixture";

const H = 96;
const put = (m: ReturnType<typeof emptyMap>, x: number, y: number, v: Partial<Record<keyof ReturnType<typeof emptyMap>["terrain"], number>>) => {
  for (const [k, n] of Object.entries(v)) (m.terrain[k as "unitModel"] as Uint16Array)[H * x + y] = n;
};
const picked = { unitModel: 11, variation: 2, angle: 1, roadModel: 5, roadVariation: 6, roadAngle: 3, elevation: 9 };

test("stamp ground only keeps road and elevation", () => {
  const m = emptyMap();
  put(m, 4, 5, { roadModel: 7, roadVariation: 1, roadAngle: 2, elevation: 1 });
  const op = stampOp(m, picked, "ground", [{ x: 4, y: 5 }]);
  expect(op.label).toBe("Stamp terrain");
  expect(op.changes).toEqual([{ x: 4, y: 5, tile: { unitModel: 11, variation: 2, angle: 1, roadModel: 7, roadVariation: 1, roadAngle: 2, elevation: 1 } }]);
});

test("stamp road only keeps ground; both copies both; elevation is never copied", () => {
  const m = emptyMap();
  expect(stampOp(m, picked, "road", [{ x: 1, y: 1 }]).changes[0]!.tile).toEqual({ unitModel: 0, variation: 0, angle: 0, roadModel: 5, roadVariation: 6, roadAngle: 3, elevation: 0 });
  expect(stampOp(m, picked, "both", [{ x: 1, y: 1 }]).changes[0]!.tile).toEqual({ ...picked, elevation: 0 });
});

test("stamp skips tiles that already match and out-of-range tiles", () => {
  const m = emptyMap();
  put(m, 2, 2, { unitModel: 11, variation: 2, angle: 1 });
  expect(stampOp(m, picked, "ground", [{ x: 2, y: 2 }, { x: -1, y: 0 }, { x: 0, y: 96 }]).changes).toEqual([]);
});

test("elevation +1 and -1; lowering at 0 qualifies nothing", () => {
  const m = emptyMap();
  put(m, 3, 3, { elevation: 1 });
  expect(elevationOp(m, [{ x: 3, y: 3 }], 1)).toMatchObject({ label: "Raise terrain", changes: [{ x: 3, y: 3, tile: { elevation: 2 } }] });
  expect(elevationOp(m, [{ x: 3, y: 3 }], -1)).toMatchObject({ label: "Lower terrain", changes: [{ tile: { elevation: 0 } }] });
  expect(elevationOp(m, [{ x: 0, y: 0 }], -1).changes).toEqual([]);
});

test("rotate prefers the road, skips base ground, and wraps 3 to 0 (upstream TryRotate)", () => {
  const m = emptyMap();
  put(m, 1, 1, { roadModel: 5, roadAngle: 3, unitModel: 11, angle: 2 });
  put(m, 2, 2, { unitModel: 11, angle: 3 });
  const op = rotateOp(m, [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]);
  expect(op.label).toBe("Rotate terrain");
  expect(op.changes).toHaveLength(2);
  expect(op.changes[0]!.tile).toMatchObject({ roadAngle: 0, angle: 2 });
  expect(op.changes[1]!.tile).toMatchObject({ angle: 0 });
});

test("clear road zeroes only the road fields and skips tiles without a road", () => {
  const m = emptyMap();
  put(m, 1, 1, { roadModel: 5, roadVariation: 6, roadAngle: 3, unitModel: 11, elevation: 2 });
  const op = clearRoadOp(m, [{ x: 1, y: 1 }, { x: 2, y: 2 }]);
  expect(op.label).toBe("Clear road");
  expect(op.changes).toEqual([{ x: 1, y: 1, tile: { unitModel: 11, variation: 0, angle: 0, roadModel: 0, roadVariation: 0, roadAngle: 0, elevation: 2 } }]);
});

test("terrainTileUnder reads a tile and returns null outside the layer", () => {
  const m = emptyMap();
  put(m, 6, 7, { unitModel: 17, elevation: 2 });
  expect(terrainTileUnder(m, { x: 6, y: 7 })).toMatchObject({ unitModel: 17, elevation: 2 });
  expect(terrainTileUnder(m, { x: 112, y: 0 })).toBeNull();
  expect(terrainTileUnder(m, { x: 0, y: -1 })).toBeNull();
});
