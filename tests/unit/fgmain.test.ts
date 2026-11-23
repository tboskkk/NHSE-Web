import { expect, test } from "bun:test";
import { joinFieldItems, parseFgMain } from "../../scripts/models/fgmain";

const row = (...c: string[]) => c.join("\t");
const HEAD = row("0x39B5A93D", "0x11111111", "0x87BF00E8", "0x64B8FFF8", "0x48EF0398"); // model, filler, name, colour, file
const tsv = [
  HEAD,
  row("PltTreeOak4\0", "x", "PltTreeOak4\0\0", "255", "PltTreeOak"),
  row("PltFlwCosmos2", "x", "PltFlwCosmos3Red", "2", "PltFlwCosmos"),
  row("PltFlwCosmos0", "x", "PltFlwCosmos1Red", "6", "PltFlwCosmos"),
  row("OtherModel", "x", "PltTreeOak4", "1", "OtherFile"), // duplicate name: first wins
  row("PltNoColour", "x", "PltWeird", "abc", "PltWeird"), // non-numeric colour
  row("short"),
].join("\n");

test("parseFgMain maps item names to file, model and colour index", () => {
  const m = parseFgMain(tsv);
  expect(m.get("PltTreeOak4")).toEqual({ file: "PltTreeOak", model: "PltTreeOak4", colour: null });
  expect(m.get("PltFlwCosmos3Red")).toEqual({ file: "PltFlwCosmos", model: "PltFlwCosmos2", colour: 2 });
  expect(m.get("PltFlwCosmos1Red")?.colour).toBe(6);
  expect(m.get("PltWeird")?.colour).toBeNull();
  expect(m.size).toBe(4);
});

test("parseFgMain names the missing column", () => {
  expect(() => parseFgMain("0x1\t0x2\nx\ty")).toThrow(/0x87BF00E8/);
});

test("joinFieldItems maps ids by name and lists ids with no FgMainParam row", () => {
  const fg = parseFgMain(tsv);
  const j = joinFieldItems(fg, { "60000": { name: "PltTreeOak4" }, "60015": { name: "PltFlwCosmos3Red" }, "60999": { name: "FenceWood" } });
  expect([...j.items.keys()]).toEqual([60000, 60015]);
  expect(j.items.get(60015)?.colour).toBe(2);
  expect(j.unmapped).toEqual([60999]);
});
