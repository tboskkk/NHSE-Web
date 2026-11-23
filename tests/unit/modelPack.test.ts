import { expect, test } from "bun:test";
import { encodeGeometry, type Geometry } from "../../app/src/map3d/modelFormat";
import { isModelPack, modelPackStore, parseModelPack } from "../../app/src/map3d/modelPack";
import { createPackStore } from "../../app/src/map/spritePack";
import { encodePng } from "../../scripts/sprites/png";

const geo = (): Geometry => ({ positions: Float32Array.of(0, 0, 0, 1, 0, 0, 0, 1, 0), normals: Float32Array.of(0, 0, 1, 0, 0, 1, 0, 0, 1), uvs: Float32Array.of(0, 0, 1, 0, 0, 1), indices: Uint32Array.of(0, 1, 2) });
const png = encodePng(1, 1, Uint8Array.of(10, 20, 30, 255));
const enc = (s: string) => new TextEncoder().encode(s);

function pack(prefix = "") {
  const manifest = {
    version: 1,
    items: { "60000": "A@-", "60001": "B@-", "60002": "C@-", "60003": "D@-" },
    models: {
      "A@-": { geometry: "geo/A.bin", texture: "tex/A.png" },
      "B@-": { geometry: "geo/B.bin", texture: "tex/B.png" }, // geometry truncated
      "C@-": { geometry: "geo/C.bin", texture: "tex/C.png" }, // texture missing
      "D@-": { geometry: "geo/D.bin", texture: "tex/D.png" }, // texture is not a PNG
    },
  };
  const bytes = encodeGeometry(geo());
  return [
    { name: `${prefix}models.json`, data: enc(JSON.stringify(manifest)) },
    { name: `${prefix}geo/A.bin`, data: bytes },
    { name: `${prefix}geo/B.bin`, data: bytes.slice(0, bytes.length - 4) },
    { name: `${prefix}geo/C.bin`, data: bytes },
    { name: `${prefix}geo/D.bin`, data: bytes },
    { name: `${prefix}tex/A.png`, data: png },
    { name: `${prefix}tex/B.png`, data: png },
    { name: `${prefix}tex/D.png`, data: enc("not a png") },
  ];
}

test("isModelPack recognises models.json at any depth and ignores sprite packs", () => {
  expect(isModelPack(pack())).toBe(true);
  expect(isModelPack(pack("personal-models/"))).toBe(true);
  expect(isModelPack([{ name: "00010_0.png", data: png }, { name: "notes.txt", data: enc("x") }])).toBe(false);
  expect(isModelPack([])).toBe(false);
});

test("parseModelPack loads good models and counts each bad one as skipped", () => {
  for (const prefix of ["", "personal-models/", "x/y/"]) {
    const r = parseModelPack(pack(prefix));
    expect([...r.models.keys()]).toEqual(["A@-"]);
    expect(r.skipped).toBe(3);
    expect([...r.items]).toEqual([[60000, "A@-"]]); // items of skipped models fall back to sprites
    expect(r.models.get("A@-")!.geometry.indices.length).toBe(3);
    expect(r.models.get("A@-")!.texture).toEqual(png);
  }
});

test("parseModelPack rejects a pack with a bad manifest", () => {
  expect(() => parseModelPack([{ name: "models.json", data: enc('{"version":2}') }])).toThrow(/version/);
  expect(() => parseModelPack([{ name: "geo/A.bin", data: png }])).toThrow(/models.json/);
});

test("the model store keeps its own key and falls back to memory without IndexedDB", async () => {
  const store = createPackStore(undefined, "models");
  await store.save(new Map([["models.json", enc("{}")]]));
  expect([...(await store.load()).keys()]).toEqual(["models.json"]);
  await store.clear();
  expect((await store.load()).size).toBe(0);
  expect(typeof modelPackStore.save).toBe("function");
});
