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
