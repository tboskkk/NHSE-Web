const COL = { id: "0x54706054", name: "0x39B5A93D" } as const;
const clean = (s: string) => s.replaceAll("\0", "").trim();

/** `Bcsv/FieldLandMakingUnitModelParam.bcsv` (dumped to TSV): terrain unit id -> piece name. Unit 0 (`Base`) and rows without a name are skipped; first row wins on duplicate ids. */
export function parseUnitParam(tsv: string): Map<number, string> {
  const lines = tsv.split("\n");
  const head = (lines[0] ?? "").split("\t").map(clean);
  const at = (h: string) => {
    const i = head.indexOf(h);
    if (i < 0) throw new Error(`FieldLandMakingUnitModelParam has no ${h} column`);
    return i;
  };
  const [iId, iName] = [at(COL.id), at(COL.name)];
  const out = new Map<number, string>();
  for (const line of lines.slice(1)) {
    const c = line.split("\t").map(clean);
    const id = Number(c[iId]);
    const name = c[iName];
    if (!name || !Number.isInteger(id) || id === 0 || out.has(id)) continue;
    out.set(id, name);
  }
  return out;
}

/** `River0A` -> `FldUnitRiver`, `RoadSoil3B` -> `FldUnitRoadSoil`, `Fall301` -> `FldUnitFall`. */
export const pieceFile = (name: string): string => "FldUnit" + name.replace(/\d.*$/, "");

/** Distinct piece names grouped by family file; files and names sorted. */
export function enumeratePieces(units: Map<number, string>): { file: string; names: string[] }[] {
  const byFile = new Map<string, Set<string>>();
  for (const name of units.values()) {
    const f = pieceFile(name);
    byFile.set(f, (byFile.get(f) ?? new Set()).add(name));
  }
  return [...byFile].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([file, names]) => ({ file, names: [...names].sort() }));
}
