import type { Tile } from "./pick";

export type PaintSink = { start(t: Tile): void; move(t: Tile): void; end(): void; cancel(): void };

export type GestureOptions = {
  sink(): PaintSink | null;
  /** Tile under a canvas point (in the grid the tool paints on), or null on a miss. */
  tileAt(x: number, y: number): Tile | null;
  spaceHeld(): boolean;
  onHover(x: number, y: number): void;
};

/** Pointer-to-stroke rules shared with the 2D view: one left pointer paints, anything else (second finger, space, other buttons) does not. */
export function createGestures(o: GestureOptions) {
  const pointers = new Set<number>();
  let active: PaintSink | null = null;
  const stop = (commit: boolean) => {
    const s = active;
    active = null;
    if (s) (commit ? s.end() : s.cancel());
  };
  return {
    /** True when a paint stroke started (the caller should capture the pointer). */
    down(e: { id: number; button: number; x: number; y: number }): boolean {
      stop(false); // a second pointer turns the gesture into pan/zoom
      pointers.add(e.id);
      const sink = o.sink();
      if (!sink || pointers.size !== 1 || e.button !== 0 || o.spaceHeld()) return false;
      const t = o.tileAt(e.x, e.y);
      if (!t) return false;
      active = sink;
      sink.start(t);
      return true;
    },
    move(e: { id: number; x: number; y: number }): void {
      if (!pointers.has(e.id)) return o.onHover(e.x, e.y);
      if (!active) return;
      o.onHover(e.x, e.y);
      const t = o.tileAt(e.x, e.y);
      if (t) active.move(t);
    },
    up(e: { id: number; cancelled: boolean }): void {
      pointers.delete(e.id);
      stop(!e.cancelled);
    },
    cancel(): void {
      stop(false);
    },
    get painting(): boolean {
      return active !== null;
    },
  };
}
