export type PlantRef = { file: string; model: string; colour: number | null };

const COL = { name: "0x87BF00E8", model: "0x39B5A93D", file: "0x48EF0398", colour: "0x64B8FFF8" } as const;
const clean = (s: string) => s.replaceAll("\0", "").trim();

/** `Bcsv/FgMainParam.bcsv` (dumped to TSV): item name -> plant file, model and colour index (255 = none). First row wins on duplicate names. */
export function parseFgMain(tsv: string): Map<string, PlantRef> {
  const lines = tsv.split("\n");
  const head = (lines[0] ?? "").split("\t").map(clean);
  const at = (h: string) => {
    const i = head.indexOf(h);
    if (i < 0) throw new Error(`FgMainParam has no ${h} column`);
    return i;
  };
  const [iName, iModel, iFile, iColour] = [at(COL.name), at(COL.model), at(COL.file), at(COL.colour)];
  const out = new Map<string, PlantRef>();
  for (const line of lines.slice(1)) {
    const c = line.split("\t").map(clean);
    const name = c[iName], model = c[iModel], file = c[iFile];
    if (!name || !model || !file || out.has(name)) continue;
    const n = Number(c[iColour]);
    out.set(name, { file, model, colour: Number.isInteger(n) && n !== 255 ? n : null });
  }
  return out;
}

/** Field-item ids (from items.json) with a plant model, plus the ids whose name has no FgMainParam row. */
export function joinFieldItems(fg: Map<string, PlantRef>, fieldItems: Record<string, { name: string }>): { items: Map<number, PlantRef>; unmapped: number[] } {
  const items = new Map<number, PlantRef>();
  const unmapped: number[] = [];
  for (const [id, f] of Object.entries(fieldItems)) {
    const ref = fg.get(f.name);
    if (ref) items.set(Number(id), ref);
    else unmapped.push(Number(id));
  }
  return { items, unmapped };
}
