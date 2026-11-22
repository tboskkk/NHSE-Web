import { SaveLoadError, type SaveFiles } from "@nhse/core";

/**
 * Finds the shallowest directory holding both main.dat and mainHeader.dat, re-keys paths
 * relative to it and drops everything outside it. Throws SaveLoadError("missing-main") if none.
 */
export function findSaveRoot(entries: Map<string, Uint8Array>): SaveFiles {
  let best: string | null = null;
  let bestDepth = Infinity;
  for (const key of entries.keys()) {
    if (!(key === "main.dat" || key.endsWith("/main.dat"))) continue;
    const prefix = key.slice(0, key.length - "main.dat".length);
    if (!entries.has(prefix + "mainHeader.dat")) continue;
    const depth = prefix === "" ? 0 : prefix.split("/").length - 1;
    if (depth < bestDepth || (depth === bestDepth && prefix < best!)) {
      best = prefix;
      bestDepth = depth;
    }
  }
  if (best === null)
    throw new SaveLoadError("missing-main", "No folder with both main.dat and mainHeader.dat was found, so this is not an ACNH save.");
  const out: SaveFiles = new Map();
  for (const [k, v] of entries) if (k.startsWith(best)) out.set(k.slice(best.length), v);
  return out;
}
