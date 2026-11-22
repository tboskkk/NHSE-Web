const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Score a subsequence match: [longest contiguous run, earliest start]; null when `q` is not a subsequence of `t`. */
function score(t: string, q: string): [number, number] | null {
  const at = t.indexOf(q);
  if (at >= 0) return [q.length, at];
  let ti = 0;
  let first = -1;
  let run = 0;
  let best = 0;
  let prev = -2;
  for (const ch of q) {
    ti = t.indexOf(ch, ti);
    if (ti < 0) return null;
    if (first < 0) first = ti;
    run = ti === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = ti++;
  }
  return [best, first];
}

/** Case- and diacritic-insensitive subsequence filter, ranked by contiguous-run length then earliest index. */
export function fuzzyFilter<T>(items: T[], query: string, key: (t: T) => string, limit = 200): T[] {
  const q = norm(query.trim());
  if (!q) return items.slice(0, limit);
  const hits: { item: T; run: number; start: number; order: number }[] = [];
  items.forEach((item, order) => {
    const s = score(norm(key(item)), q);
    if (s) hits.push({ item, run: s[0], start: s[1], order });
  });
  hits.sort((a, b) => b.run - a.run || a.start - b.start || a.order - b.order);
  return hits.slice(0, limit).map((h) => h.item);
}
