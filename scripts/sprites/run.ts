import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Deps, renderVariant } from "./render";

export type Source = Deps & { items(): Promise<{ id: number; model: string; variants: number[] }[]> };
export type Report = { rendered: number; skipped: number; existing: number; multiAlb: number; reasons: Record<string, number>; items: Record<string, string> };
export type RunOptions = { out: string; only?: string; jobs: number; onProgress?: (done: number, total: number) => void };

const fileName = (id: number, v: number) => `${String(id).padStart(5, "0")}_${v}.png`;

/** Renders every item variant that does not already have a sprite in `out`; failures are recorded, never thrown. */
export async function runAll(opts: RunOptions, src: Source): Promise<Report> {
  mkdirSync(opts.out, { recursive: true });
  const report: Report = { rendered: 0, skipped: 0, existing: 0, multiAlb: 0, reasons: {}, items: {} };
  const skip = (key: string, reason: string) => {
    report.skipped++;
    report.reasons[reason] = (report.reasons[reason] ?? 0) + 1;
    report.items[key] = reason;
  };
  const todo: { id: number; model: string; v: number }[] = [];
  for (const it of await src.items()) {
    if (opts.only !== undefined && opts.only !== String(it.id) && opts.only !== it.model) continue;
    if (it.variants.length === 0) skip(String(it.id), "no ReBody variants");
    for (const v of it.variants) {
      if (existsSync(join(opts.out, fileName(it.id, v)))) {
        report.existing++;
        report.items[`${it.id}_${v}`] = "existing";
      } else todo.push({ id: it.id, model: it.model, v });
    }
  }
  let next = 0, done = 0;
  const worker = async () => {
    for (let t = todo[next++]; t; t = todo[next++]) {
      const key = `${t.id}_${t.v}`;
      try {
        const r = await renderVariant(src, t, t.v);
        writeFileSync(join(opts.out, fileName(t.id, t.v)), r.png);
        report.rendered++;
        if (r.albCount > 1) report.multiAlb++;
        report.items[key] = "ok";
      } catch (e) {
        skip(key, e instanceof Error ? e.message : String(e));
      }
      opts.onProgress?.(++done, todo.length);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.jobs) }, worker));
  writeFileSync(`${opts.out}.report.json`, JSON.stringify(report, null, 1));
  return report;
}
