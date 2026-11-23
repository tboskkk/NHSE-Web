import { expect, test } from "bun:test";
import { decodeGeometry, encodeGeometry, type Geometry, parseManifest } from "../../app/src/map3d/modelFormat";

const geo = (): Geometry => ({
  positions: Float32Array.of(0, 0, 0, 1, 0, 0, 0, 1, 0),
  normals: Float32Array.of(0, 0, 1, 0, 0, 1, 0, 0, 1),
  uvs: Float32Array.of(0, 0, 1, 0, 0, 1),
  indices: Uint32Array.of(0, 1, 2),
});

test("geometry round-trips through the binary format", () => {
  const d = decodeGeometry(encodeGeometry(geo()));
  expect([...d.positions]).toEqual([...geo().positions]);
  expect([...d.normals]).toEqual([...geo().normals]);
  expect([...d.uvs]).toEqual([...geo().uvs]);
  expect([...d.indices]).toEqual([0, 1, 2]);
});

test("decodeGeometry rejects a wrong magic, truncated data and out-of-range indices", () => {
  const ok = encodeGeometry(geo());
  const bad = ok.slice();
  bad[0] = 0;
  expect(() => decodeGeometry(bad)).toThrow(/magic/);
  expect(() => decodeGeometry(ok.slice(0, ok.length - 4))).toThrow(/truncated/);
  expect(() => decodeGeometry(ok.slice(0, 5))).toThrow(/truncated/);
  const g = geo();
  g.indices = Uint32Array.of(0, 1, 7);
  expect(() => decodeGeometry(encodeGeometry(g))).toThrow(/index/);
});

test("parseManifest accepts version 1 and rejects other or malformed manifests", () => {
  const m = { version: 1, items: { "60000": "PltTreeOak4@-" }, models: { "PltTreeOak4@-": { geometry: "geo/PltTreeOak4.bin", texture: "tex/a.png" } } };
  expect(parseManifest(JSON.stringify(m)).items["60000"]).toBe("PltTreeOak4@-");
  expect(() => parseManifest(JSON.stringify({ ...m, version: 2 }))).toThrow(/version/);
  expect(() => parseManifest(JSON.stringify({ version: 1, items: {} }))).toThrow(/models/);
  expect(() => parseManifest(JSON.stringify({ ...m, models: { k: { geometry: 3, texture: "x" } } }))).toThrow(/geometry/);
  expect(() => parseManifest("not json")).toThrow();
});

test("parseManifest accepts an optional terrain table whose values are model keys, and rejects others", () => {
  const base = { version: 1, items: {}, models: { P_0: { geometry: "geo/P_0.bin", texture: "tex/F.png" } } };
  expect(parseManifest(JSON.stringify({ ...base, terrain: { "1_0": "P_0" } })).terrain).toEqual({ "1_0": "P_0" });
  expect(parseManifest(JSON.stringify(base)).terrain).toBeUndefined();
  expect(() => parseManifest(JSON.stringify({ ...base, terrain: { "1_0": "Nope" } }))).toThrow(/terrain/);
  expect(() => parseManifest(JSON.stringify({ ...base, terrain: [] }))).toThrow(/terrain/);
});

test("geometry with material groups round-trips and keeps raw (tiling) UVs", () => {
  const g: Geometry = { ...geo(), uvs: Float32Array.of(0, 0, 2.5, -1, 0, 1), groups: [{ start: 0, count: 3, material: 1 }] };
  const d = decodeGeometry(encodeGeometry(g));
  expect(d.groups).toEqual([{ start: 0, count: 3, material: 1 }]);
  expect([...d.uvs]).toEqual([0, 0, 2.5, -1, 0, 1]);
  expect(decodeGeometry(encodeGeometry(geo())).groups).toBeUndefined();
});

test("decodeGeometry rejects groups that run past the index list", () => {
  const g: Geometry = { ...geo(), groups: [{ start: 0, count: 6, material: 0 }] };
  expect(() => decodeGeometry(encodeGeometry(g))).toThrow(/group/);
  const trunc = encodeGeometry({ ...geo(), groups: [{ start: 0, count: 3, material: 0 }] });
  expect(() => decodeGeometry(trunc.slice(0, trunc.length - 4))).toThrow(/truncated/);
});

test("parseManifest accepts a per-piece textures list of strings and rejects others", () => {
  const ok = { version: 1, items: {}, models: { P_0: { geometry: "g", texture: "t0", textures: ["t0", "t1"] } } };
  expect(parseManifest(JSON.stringify(ok)).models["P_0"]!.textures).toEqual(["t0", "t1"]);
  expect(() => parseManifest(JSON.stringify({ ...ok, models: { P_0: { geometry: "g", texture: "t0", textures: [1] } } }))).toThrow(/textures/);
  expect(() => parseManifest(JSON.stringify({ ...ok, models: { P_0: { geometry: "g", texture: "t0", textures: [] } } }))).toThrow(/textures/);
});
