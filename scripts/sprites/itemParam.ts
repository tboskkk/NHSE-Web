const ID_COLUMN = "0x54706054";
const clean = (s: string) => s.replaceAll("\0", "").trim();

/** Item id -> furniture model name from a dumped ItemParam TSV (hash-named headers; row order is NOT the id). */
export function parseItemParam(tsv: string, modelExists: (name: string) => boolean): { id: number; model: string }[] {
  const lines = tsv.split("\n");
  const idCol = (lines[0] ?? "").split("\t").map(clean).indexOf(ID_COLUMN);
  if (idCol < 0) throw new Error(`ItemParam has no ${ID_COLUMN} column`);
  const seen = new Set<number>();
  const out: { id: number; model: string }[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split("\t").map(clean);
    const id = Number(cells[idCol]);
    if (cells.length <= idCol || !Number.isInteger(id) || seen.has(id)) continue;
    const model = cells.find((c) => /^Ftr[A-Za-z0-9]+$/.test(c) && modelExists(c));
    if (!model) continue;
    seen.add(id);
    out.push({ id, model });
  }
  return out;
}
