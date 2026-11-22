import { unzip, zipSync } from "fflate";
import type { SaveFiles } from "@nhse/core";

/** Zips files under `rootName/`. Level 0: save files are already high-entropy. */
export function toZip(files: SaveFiles, rootName: string): Uint8Array {
  const tree: Record<string, Uint8Array> = {};
  for (const [k, v] of files) tree[`${rootName}/${k}`] = v;
  return zipSync(tree, { level: 0 });
}

/** Raw zip contents keyed by path (directories and macOS metadata skipped); resolve the root with findSaveRoot. */
export function fromZip(bytes: Uint8Array): Promise<SaveFiles> {
  return new Promise((resolve, reject) =>
    unzip(bytes, (err, data) => {
      if (err) return reject(err);
      const out: SaveFiles = new Map();
      for (const [k, v] of Object.entries(data)) {
        if (k.endsWith("/") || k.startsWith("__MACOSX/") || k.split("/").pop()!.startsWith("._")) continue;
        out.set(k, v);
      }
      resolve(out);
    }),
  );
}
