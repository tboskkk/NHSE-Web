/** Anything exposing its decrypted file buffers (HorizonSave satisfies this). */
export interface SessionTarget {
  pairs(): { path: string; data: Uint8Array }[];
}

export type Patch = { path: string; offset: number; before: Uint8Array; after: Uint8Array };
export type Change = { label: string; patches: Patch[] };

/** Equal bytes allowed between two changed runs before they become separate patches. */
const COALESCE_GAP = 8;

function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Edit history over a save's decrypted buffers. Every edit is a set of byte patches
 * (path, offset, before, after), so undo/redo restore exact bytes.
 */
export class EditSession<T extends SessionTarget = SessionTarget> {
  private readonly pairs: Map<string, Uint8Array>;
  private shadow = new Map<string, Uint8Array>(); // data as of the last recorded change
  private baseline = new Map<string, Uint8Array>(); // data as of load / last markSaved
  private applied: Change[] = [];
  private undone: Change[] = [];

  constructor(private readonly target: T) {
    this.pairs = new Map(target.pairs().map((p) => [p.path, p.data]));
    this.resync();
  }

  get changes(): readonly Change[] {
    return this.applied;
  }

  /** Runs `fn`, records the byte changes it made. Returns null (records nothing) if no byte changed. */
  apply(label: string, fn: (target: T) => void): Change | null {
    try {
      fn(this.target);
    } catch (e) {
      this.revertToShadow();
      throw e;
    }
    const patches = this.diff();
    if (patches.length === 0) return null;
    const change: Change = { label, patches };
    this.applied.push(change);
    this.undone = [];
    return change;
  }

  undo(): Change | null {
    const c = this.applied.pop();
    if (!c) return null;
    this.write(c, "before");
    this.undone.push(c);
    return c;
  }

  redo(): Change | null {
    const c = this.undone.pop();
    if (!c) return null;
    this.write(c, "after");
    this.applied.push(c);
    return c;
  }

  /** Paths of pairs whose bytes differ from the last markSaved() (or load) baseline. */
  dirtyPairs(): Set<string> {
    const out = new Set<string>();
    for (const [path, data] of this.pairs) if (!equal(data, this.baseline.get(path)!)) out.add(path);
    return out;
  }

  /**
   * Declares the current bytes as saved. Also absorbs bytes changed outside apply()
   * (e.g. hash fixes made while saving) so they are never recorded as user edits.
   */
  markSaved(): void {
    this.resync();
  }

  /**
   * Folds bytes changed outside apply() (save-time hash fixes) into the undo shadow only,
   * leaving the saved baseline alone: they are not user edits, and nothing is "saved" yet.
   */
  absorb(): void {
    this.shadow = new Map([...this.pairs].map(([p, d]) => [p, d.slice()]));
  }

  private resync(): void {
    this.shadow = new Map([...this.pairs].map(([p, d]) => [p, d.slice()]));
    this.baseline = new Map([...this.pairs].map(([p, d]) => [p, d.slice()]));
  }

  private write(c: Change, which: "before" | "after"): void {
    for (const p of c.patches) {
      this.pairs.get(p.path)!.set(p[which], p.offset);
      this.shadow.get(p.path)!.set(p[which], p.offset);
    }
  }

  private revertToShadow(): void {
    for (const [path, data] of this.pairs) data.set(this.shadow.get(path)!);
  }

  private diff(): Patch[] {
    const patches: Patch[] = [];
    for (const [path, data] of this.pairs) {
      const shadow = this.shadow.get(path)!;
      let start = -1;
      let lastDiff = -1;
      const flush = () => {
        if (start < 0) return;
        const end = lastDiff + 1;
        patches.push({ path, offset: start, before: shadow.slice(start, end), after: data.slice(start, end) });
        shadow.set(data.subarray(start, end), start);
        start = -1;
      };
      for (let i = 0; i < data.length; i++) {
        if (data[i] === shadow[i]) continue;
        if (start >= 0 && i - lastDiff - 1 > COALESCE_GAP) flush();
        if (start < 0) start = i;
        lastDiff = i;
      }
      flush();
    }
    return patches;
  }
}
