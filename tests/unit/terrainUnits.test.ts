import { expect, test } from "bun:test";
import { enumeratePieces, parseUnitParam, pieceFile } from "../../scripts/models/terrain";

const row = (...c: string[]) => c.join("\t");
// columns: filler, unit id (0x54706054), filler, piece name (0x39B5A93D)
const tsv = [
  row("0x1", "0x54706054", "0x2", "0x39B5A93D"),
  row("x", "0", "x", "Base"),
  row("x", "1", "x", "River0A      "),
  row("x", "22\0", "x", "Cliff0A"),
  row("x", "23", "x", "Cliff0A"),
  row("x", "24", "x", "Cliff0A"),
  row("x", "59", "x", "Fall100"),
  row("x", "71", "x", "RoadSoil0A"),
  row("x", "22", "x", "Dup"), // duplicate id: first wins
  row("x", "30", "x", ""), // no name
  row("short"),
].join("\n");

test("parseUnitParam maps unit ids (not row numbers) to piece names", () => {
  const m = parseUnitParam(tsv);
  expect([...m]).toEqual([[1, "River0A"], [22, "Cliff0A"], [23, "Cliff0A"], [24, "Cliff0A"], [59, "Fall100"], [71, "RoadSoil0A"]]);
});

test("parseUnitParam names the missing column", () => {
  expect(() => parseUnitParam("0x1\t0x2\nx\ty")).toThrow(/0x54706054/);
});

test("pieceFile derives the family file from the piece name", () => {
  expect(pieceFile("River0A")).toBe("FldUnitRiver");
  expect(pieceFile("RoadSoil3B")).toBe("FldUnitRoadSoil");
  expect(pieceFile("Fall301")).toBe("FldUnitFall");
  expect(pieceFile("Cliff2A")).toBe("FldUnitCliff");
  expect(pieceFile("RoadFanPattern0A")).toBe("FldUnitRoadFanPattern");
});

test("enumeratePieces groups distinct names by family, sorted", () => {
  const e = enumeratePieces(parseUnitParam(tsv));
  expect(e).toEqual([
    { file: "FldUnitCliff", names: ["Cliff0A"] },
    { file: "FldUnitFall", names: ["Fall100"] },
    { file: "FldUnitRiver", names: ["River0A"] },
    { file: "FldUnitRoadSoil", names: ["RoadSoil0A"] },
  ]);
});
