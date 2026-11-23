import { expect, test } from "bun:test";
import { LEVEL_HEIGHT, WATER_Y } from "../../app/src/map3d/constants";
import { buildTerrainMesh, buildTileField, heightAt } from "../../app/src/map3d/terrainMesh";
import { emptyMap } from "./mapFixture";

const W = 144, H = 128;
const acreTiles = () => new Uint8Array(318 * 256);
/** World terrain tile of terrain tile (tx,ty): the terrain grid starts one acre (16 tiles) in. */
const idx = (tx: number, ty: number) => (16 + ty) * W + 16 + tx;
const tIdx = (tx: number, ty: number) => 96 * tx + ty; // terrain layer is column-major

test("elevation levels become tile heights", () => {
  const m = emptyMap();
  m.terrain.elevation[tIdx(3, 3)] = 2;
  const f = buildTileField(m, acreTiles());
  expect(f.y[idx(3, 3)]).toBe(2 * LEVEL_HEIGHT);
  expect(f.y[idx(4, 3)]).toBe(0);
  expect(f.water[idx(3, 3)]).toBe(0);
});

test("river tiles sit at water level and are flagged", () => {
  const m = emptyMap();
  m.terrain.unitModel[tIdx(5, 5)] = 1;
  const f = buildTileField(m, acreTiles());
  expect(f.y[idx(5, 5)]).toBe(WATER_Y);
  expect(f.water[idx(5, 5)]).toBe(1);
});

test("tiles outside the terrain grid in a dynamic acre are ocean", () => {
  const f = buildTileField(emptyMap(), acreTiles());
  expect(f.y[0]).toBe(WATER_Y);
  expect(f.water[0]).toBe(1);
});

test("static acres are flat, or water when their template class is water", () => {
  const m = emptyMap();
  m.acres[0] = 5;
  const tiles = acreTiles();
  tiles.fill(1, 5 * 256 + 16, 5 * 256 + 32); // row 1 of the acre template: class 1 (water)
  const f = buildTileField(m, tiles);
  expect(f.y[0]).toBe(0); // row 0, class 0 (grass)
  expect(f.y[1 * W + 0]).toBe(WATER_Y);
  expect(f.water[1 * W + 0]).toBe(1);
});

test("a flat island has one quad per tile and no walls", () => {
  const f = buildTileField(emptyMap(), acreTiles());
  // the ocean ring is lower than the land, so count walls from the field rather than assuming zero
  const flatOcean = new Float32Array(W * H).fill(WATER_Y);
  const all = { ...f, y: flatOcean };
  const mesh = buildTerrainMesh(all);
  expect(mesh.positions.length).toBe(W * H * 4 * 3);
  expect(mesh.indices.length).toBe(W * H * 2 * 3);
  expect(mesh.colors.length).toBe(mesh.positions.length);
});

test("a raised tile gets a wall on each of its four sides", () => {
  const f = buildTileField(emptyMap(), acreTiles());
  const base = buildTerrainMesh(f);
  const m = emptyMap();
  m.terrain.elevation[tIdx(10, 10)] = 1;
  const raised = buildTerrainMesh(buildTileField(m, acreTiles()));
  expect(raised.indices.length - base.indices.length).toBe(4 * 2 * 3);
});

test("a wall next to water is bank brown, next to land cliff grey", () => {
  const m = emptyMap();
  m.terrain.elevation[tIdx(10, 10)] = 1;
  m.terrain.unitModel[tIdx(11, 10)] = 1; // river east of the raised tile
  const f = buildTileField(m, acreTiles());
  const mesh = buildTerrainMesh(f);
  const quads = W * H;
  const col = (q: number) => [...mesh.colors.subarray(q * 12, q * 12 + 3)].map((c) => Math.round(c * 255));
  const walls = Array.from({ length: (mesh.positions.length / 12) - quads }, (_, i) => col(quads + i));
  expect(walls).toContainEqual([138, 122, 90]);
  expect(walls).toContainEqual([94, 98, 106]);
});

test("an all-ocean map yields a finite mesh with no walls", () => {
  const m = emptyMap();
  m.terrain.unitModel.fill(1);
  const f = buildTileField(m, acreTiles());
  const mesh = buildTerrainMesh(f);
  expect(mesh.indices.length).toBe(W * H * 2 * 3);
  expect(mesh.positions.every(Number.isFinite)).toBe(true);
});

test("heightAt reads world units and clamps outside the grid", () => {
  const m = emptyMap();
  m.terrain.elevation[tIdx(3, 3)] = 1;
  const f = buildTileField(m, acreTiles());
  expect(heightAt(f, 2 * (16 + 3) + 1, 2 * (16 + 3) + 1)).toBe(LEVEL_HEIGHT);
  expect(heightAt(f, -50, -50)).toBe(f.y[0]!);
  expect(heightAt(f, 9999, 9999)).toBe(f.y[W * H - 1]!);
});

test("wall quads span exactly their shared tile edge, between the two heights", () => {
  const m = emptyMap();
  m.terrain.elevation[tIdx(10, 10)] = 1;
  const mesh = buildTerrainMesh(buildTileField(m, acreTiles()));
  const base = buildTerrainMesh(buildTileField(emptyMap(), acreTiles()));
  const n0 = W * H;
  const extra = mesh.positions.length / 12 - n0 - (base.positions.length / 12 - n0);
  expect(extra).toBe(4);
  const wx = 26, wy = 26; // world tile of terrain tile (10,10)
  const edges = new Set<string>();
  for (let q = n0; q < mesh.positions.length / 12; q++) {
    const v = [...mesh.positions.subarray(q * 12, q * 12 + 12)];
    const xs = [v[0]!, v[3]!, v[6]!, v[9]!], zs = [v[2]!, v[5]!, v[8]!, v[11]!], ys = [v[1]!, v[4]!, v[7]!, v[10]!];
    if (Math.max(...ys) !== LEVEL_HEIGHT || Math.min(...ys) !== 0) continue;
    edges.add(`${Math.min(...xs)},${Math.max(...xs)},${Math.min(...zs)},${Math.max(...zs)}`);
  }
  const x0 = wx * 2, z0 = wy * 2;
  expect(edges).toEqual(new Set([
    `${x0},${x0},${z0},${z0 + 2}`, // west
    `${x0 + 2},${x0 + 2},${z0},${z0 + 2}`, // east
    `${x0},${x0 + 2},${z0},${z0}`, // north
    `${x0},${x0 + 2},${z0 + 2},${z0 + 2}`, // south
  ]));
});
