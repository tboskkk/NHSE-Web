import { expect, test } from "bun:test";
import { createMapStore } from "../../app/src/map/mapStore";
import type { MapView } from "../../app/src/worker/protocol";
import { emptyMap } from "./mapFixture";

const view = () => ({ ...emptyMap(), revisionLabel: "3.0.3" }) as MapView;

test("patch writes raw values at tile indices and bumps the version", () => {
  const store = createMapStore(view());
  const seen: number[] = [];
  store.subscribe((v) => seen.push(v));
  expect(store.version).toBe(0);
  store.patch([{ layer: 1, index: 192 * 3 + 4, raw: "0000000000001234" }]);
  expect(store.map.items[1].raw[192 * 3 + 4]).toBe(0x1234n);
  expect(store.version).toBe(1);
  expect(seen).toEqual([1]);
});

test("an empty patch does not bump the version", () => {
  const store = createMapStore(view());
  store.patch([]);
  expect(store.version).toBe(0);
});

test("an out-of-range index throws and changes nothing", () => {
  const store = createMapStore(view());
  expect(() => store.patch([{ layer: 0, index: 1, raw: "0000000000000001" }, { layer: 0, index: 288 * 192, raw: "0000000000000001" }])).toThrow(RangeError);
  expect(store.map.items[0].raw[1]).toBe(0xfffen);
  expect(store.version).toBe(0);
});

test("patchStructures replaces buildings and plaza in place, bumps the version once and notifies", () => {
  const store = createMapStore(view());
  const seen: number[] = [];
  store.subscribe((v) => seen.push(v));
  const buildings = store.map.buildings.map((b) => ({ ...b }));
  buildings[2] = { type: 21, x: 100, y: 120, angle: 1, bit: 0, subType: 0, typeArg: 0, uniqueId: 3 };
  const held = store.map.buildings;
  store.patchStructures({ buildings, plaza: { x: 50, z: 60 } });
  expect(store.map.buildings).toBe(held);
  expect(store.map.buildings[2]).toMatchObject({ type: 21, x: 100 });
  expect(store.map.plaza).toEqual({ x: 50, z: 60 });
  expect(store.version).toBe(1);
  expect(seen).toEqual([1]);
});

test("patchStructures with the wrong number of buildings throws and changes nothing", () => {
  const store = createMapStore(view());
  expect(() => store.patchStructures({ buildings: [], plaza: { x: 1, z: 1 } })).toThrow(RangeError);
  expect(store.map.plaza).toEqual({ x: 0, z: 0 });
  expect(store.version).toBe(0);
});

test("structuresVersion bumps only for structure patches, not tile patches", () => {
  const store = createMapStore(view());
  store.patch([{ layer: 0, index: 1, raw: "0000000000000002" }]);
  expect(store.structuresVersion).toBe(0);
  store.patchStructures({ buildings: store.map.buildings.map((b) => ({ ...b })), plaza: { x: 1, z: 2 } });
  expect(store.structuresVersion).toBe(1);
  expect(store.version).toBe(2);
});

const tile = { unitModel: 11, variation: 2, angle: 3, roadModel: 5, roadVariation: 6, roadAngle: 7, elevation: 8 };

test("patchTerrain writes all seven fields in place and bumps version and terrainVersion", () => {
  const store = createMapStore(view());
  const held = store.map.terrain.unitModel;
  const seen: number[] = [];
  store.subscribe((v) => seen.push(v));
  store.patchTerrain([{ index: 96 * 3 + 4, tile }]);
  const t = store.map.terrain;
  expect(store.map.terrain.unitModel).toBe(held);
  expect([t.unitModel, t.variation, t.angle, t.roadModel, t.roadVariation, t.roadAngle, t.elevation].map((a) => a[96 * 3 + 4])).toEqual([11, 2, 3, 5, 6, 7, 8]);
  expect(store.terrainVersion).toBe(1);
  expect(store.version).toBe(1);
  expect(seen).toEqual([1]);
});

test("patchTerrain with a bad index throws and changes nothing", () => {
  const store = createMapStore(view());
  expect(() => store.patchTerrain([{ index: 1, tile }, { index: 112 * 96, tile }])).toThrow(RangeError);
  expect(store.map.terrain.unitModel[1]).toBe(0);
  expect(store.version).toBe(0);
  expect(store.terrainVersion).toBe(0);
});

test("an empty patchTerrain does not bump versions", () => {
  const store = createMapStore(view());
  store.patchTerrain([]);
  expect(store.version + store.terrainVersion).toBe(0);
});

test("item patches do not bump terrainVersion", () => {
  const store = createMapStore(view());
  store.patch([{ layer: 0, index: 1, raw: "0000000000000002" }]);
  expect(store.terrainVersion).toBe(0);
});
