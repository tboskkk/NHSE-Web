import { expect, test } from "bun:test";
import { parseItemParam } from "../../scripts/sprites/itemParam";

const row = (...c: string[]) => c.join("\t");
const tsv = [
  row("0x11111111", "0x54706054", "0x22222222"),
  row("5\0\0", "770\0", "FtrWireChairS\0 "), // padded cells
  row("FtrNotThere", "771", "x"), // model file does not exist
  row("a", "772", "b"), // no Ftr cell
  row("FtrOldName", "773", "FtrWireChairS"), // first existing Ftr cell wins
  row("FtrWireChairS", "770", "FtrOther"), // duplicate id: first row wins
  row("FtrShort"), // short row
].join("\n");
const exists = (n: string) => ["FtrWireChairS", "FtrOldName", "FtrOther"].includes(n);

test("parseItemParam maps item ids to the first existing Ftr model in column order", () => {
  expect(parseItemParam(tsv, exists)).toEqual([
    { id: 770, model: "FtrWireChairS" },
    { id: 773, model: "FtrOldName" },
  ]);
});

test("parseItemParam throws when the id column is missing", () => {
  expect(() => parseItemParam("0x1\t0x2\nx\ty", exists)).toThrow(/0x54706054/);
});
