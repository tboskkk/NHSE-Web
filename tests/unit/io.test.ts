import { expect, test } from "bun:test";
import { findSaveRoot } from "../../packages/io/src/saveRoot";
import { fromZip, toZip } from "../../packages/io/src/zip";
import { backupName, saveZipName } from "../../packages/io/src/download";
import { SaveLoadError } from "../../packages/core/src/save/errors";

const b = (...n: number[]) => new Uint8Array(n);
const map = (keys: string[]) => new Map(keys.map((k, i) => [k, b(i)]));

test("findSaveRoot re-keys relative to the folder holding main.dat + mainHeader.dat", () => {
  const out = findSaveRoot(map(["MySave/main.dat", "MySave/mainHeader.dat", "MySave/Villager0/personal.dat", "other/readme.txt"]));
  expect([...out.keys()].sort()).toEqual(["Villager0/personal.dat", "main.dat", "mainHeader.dat"]);
});

test("findSaveRoot works at depth 0 and picks the shallowest of two candidates", () => {
  expect([...findSaveRoot(map(["main.dat", "mainHeader.dat", "a.dat"])).keys()].sort()).toEqual(["a.dat", "main.dat", "mainHeader.dat"]);
  const out = findSaveRoot(map(["x/y/main.dat", "x/y/mainHeader.dat", "x/main.dat", "x/mainHeader.dat", "x/z.dat"]));
  expect([...out.keys()].sort()).toEqual(["main.dat", "mainHeader.dat", "y/main.dat", "y/mainHeader.dat", "z.dat"]);
});

test("findSaveRoot throws missing-main without a complete pair", () => {
  expect(() => findSaveRoot(map(["a/main.dat", "a/other.dat"]))).toThrow(SaveLoadError);
  try { findSaveRoot(map(["nothing.txt"])); } catch (e) { expect((e as SaveLoadError).code).toBe("missing-main"); }
});

test("toZip → fromZip round-trips bytes and nests under rootName", () => {
  const files = new Map([["main.dat", b(1, 2, 3)], ["Villager0/personal.dat", b(9)]]);
  const zip = toZip(files, "Home");
  const back = fromZip(zip);
  return back.then((m) => {
    expect([...m.keys()].sort()).toEqual(["Home/Villager0/personal.dat", "Home/main.dat"]);
    expect([...m.get("Home/main.dat")!]).toEqual([1, 2, 3]);
  });
});

test("file names: backup and save zips, invalid characters stripped", () => {
  expect(backupName("Home", new Date(2026, 10, 22, 14, 3))).toBe("Home_backup_2026-11-22_14-03.zip");
  expect(saveZipName("Ho/me:?", new Date(2026, 10, 22))).toBe("Home_2026-11-22.zip");
});
