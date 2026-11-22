/** Collects the distinct ArrayBuffers behind typed arrays in a result (plain objects, arrays, Maps) so they transfer instead of copy. */
export function transferables(value: unknown): Transferable[] {
  const seen = new Set<ArrayBufferLike>();
  const walk = (v: unknown, depth: number) => {
    if (v === null || typeof v !== "object" || depth > 6) return;
    if (ArrayBuffer.isView(v)) {
      seen.add(v.buffer);
      return;
    }
    if (v instanceof Map) for (const x of v.values()) walk(x, depth + 1);
    else for (const x of Object.values(v)) walk(x, depth + 1);
  };
  walk(value, 0);
  return [...seen].filter((b): b is ArrayBuffer => b instanceof ArrayBuffer);
}
