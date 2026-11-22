import { expect, test } from "bun:test";
import { fuzzyFilter } from "../../app/src/lib/fuzzy";

const id = (s: string) => s;

test('"golden shov" ranks "golden shovel" first and drops non-matches', () => {
  expect(fuzzyFilter(["shovel", "golden shovel", "golden slingshot"], "golden shov", id)).toEqual(["golden shovel"]);
  expect(fuzzyFilter(["a golden thing, shovel", "golden shovel"], "golden shov", id)[0]).toBe("golden shovel");
});

test("subsequence matches rank contiguous runs, then earliest start", () => {
  expect(fuzzyFilter(["g_o_l_d", "gold", "x gold"], "gold", id)).toEqual(["gold", "x gold", "g_o_l_d"]);
});

test('"cafe" matches "café" (case and diacritic insensitive)', () => {
  expect(fuzzyFilter(["Café", "tea"], "CAFE", id)).toEqual(["Café"]);
});

test("an empty query returns the first `limit` items unchanged", () => {
  const items = ["c", "a", "b", "d"];
  expect(fuzzyFilter(items, "", id, 3)).toEqual(["c", "a", "b"]);
  expect(fuzzyFilter(items, "  ", id)).toEqual(items);
});
