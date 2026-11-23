import { expect, test } from "bun:test";
import { LEVEL_HEIGHT } from "../../app/src/map3d/constants";
import { structureBoxes } from "../../app/src/map3d/structureBoxes";
import { buildTileField } from "../../app/src/map3d/terrainMesh";
import { emptyMap } from "./mapFixture";

const field = (m = emptyMap()) => buildTileField(m, new Uint8Array(318 * 256));

test("the plaza is a 24 x 20 plate at its world position", () => {
  const m = emptyMap();
  m.plaza = { x: 100, z: 90 };
  const [p] = structureBoxes(m, field(m));
  expect(p).toMatchObject({ kind: "plaza", x: 100, z: 90, w: 24, d: 20, h: 0.2, color: 0xbc8f8f });
});

test("a building is a 4 x 4 box standing on the ground under it", () => {
  const m = emptyMap();
  m.terrain.elevation[96 * 10 + 10] = 1; // terrain tile (10,10) = world tiles (26,26) = units 52..54
  m.buildings[3] = { ...m.buildings[3]!, type: 7, x: 52, y: 52 };
  const boxes = structureBoxes(m, field(m));
  const b = boxes.find((x) => x.kind === "building")!;
  expect(b).toMatchObject({ type: 7, x: 52, z: 52, w: 4, d: 4, h: 6, color: 0xffd400 });
  expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.y).toBeLessThanOrEqual(LEVEL_HEIGHT);
});

test("unused building slots (type 0) draw nothing", () => {
  const m = emptyMap();
  expect(structureBoxes(m, field(m)).filter((x) => x.kind === "building")).toHaveLength(0);
});
