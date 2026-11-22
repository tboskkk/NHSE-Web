import { decrypt, encrypt } from "../crypto/encryption";
import { replaceOccurrences } from "../util/bytes";
import { EncryptedFilePair } from "./encryptedFilePair";
import { Personal } from "./personal";
import { SaveLoadError } from "./errors";
import type { HashRegion, Revision } from "./revisions";
import type { SaveFiles } from "./types";

export { SaveLoadError } from "./errors";
export type { SaveFiles } from "./types";

const PLAYER_FILES = ["personal", "photo_studio_island", "postbox", "profile"] as const;
const WHERE_ARE_N = "wherearen";

/** One resident's directory (VillagerN/). */
export class Player {
  constructor(
    readonly directory: string,
    readonly personal: Personal,
    readonly photo: EncryptedFilePair,
    readonly postBox: EncryptedFilePair,
    readonly profile: EncryptedFilePair,
    readonly whereAreN?: EncryptedFilePair,
  ) {}

  pairs(): EncryptedFilePair[] {
    const base = [this.personal, this.photo, this.postBox, this.profile];
    return this.whereAreN ? [...base, this.whereAreN] : base;
  }
}

export type SaveOptions = {
  /** Test hook: replaces the encryption function (used to prove verification aborts bad writes). */
  encryptFn?: typeof encrypt;
};

export class HorizonSave {
  private constructor(
    readonly main: EncryptedFilePair,
    readonly players: Player[],
    /** Files that belong to no pair (e.g. landname.dat); carried through unchanged. */
    readonly passthrough: SaveFiles,
  ) {}

  get revision(): Revision {
    return this.main.revision;
  }

  static async load(files: SaveFiles): Promise<HorizonSave> {
    if (!EncryptedFilePair.exists(files, "main"))
      throw new SaveLoadError("missing-main", "This folder has no main.dat / mainHeader.dat pair, so it is not an ACNH save.");

    const sizes = async (path: string) => {
      const r = await EncryptedFilePair.read(files, path);
      return new EncryptedFilePair(path, r.data, r.header, r.revision);
    };
    const asPersonal = (p: EncryptedFilePair) => new Personal(p.path, p.data, p.header, p.revision);

    const main = await sizes("main");
    const expected = main.revision.sizes;
    if (main.data.length !== expected.main)
      throw new SaveLoadError("size-mismatch", `main.dat is ${main.data.length} bytes; ${main.revision.label} expects ${expected.main}.`);

    const dirs = [...new Set([...files.keys()].map((k) => /^(Villager\d+)\//.exec(k)?.[1]).filter((d): d is string => !!d))].sort(
      (a, b) => Number(a.slice(7)) - Number(b.slice(7)),
    );

    const used = new Set<string>([main.dataKey, main.headerKey]);
    const players: Player[] = [];
    for (const dir of dirs) {
      const loaded: Record<string, EncryptedFilePair> = {};
      for (const name of PLAYER_FILES) {
        const path = `${dir}/${name}`;
        if (!EncryptedFilePair.exists(files, path))
          throw new SaveLoadError("missing-player-file", `${dir} is missing ${name}.dat or ${name}Header.dat.`);
        loaded[name] = await sizes(path);
      }
      let wan: EncryptedFilePair | undefined;
      if (EncryptedFilePair.exists(files, `${dir}/${WHERE_ARE_N}`)) wan = await sizes(`${dir}/${WHERE_ARE_N}`);

      const check = (p: EncryptedFilePair, want: number) => {
        if (p.data.length !== want)
          throw new SaveLoadError("size-mismatch", `${p.dataKey} is ${p.data.length} bytes; ${main.revision.label} expects ${want}.`);
      };
      check(loaded.personal!, expected.personal);
      check(loaded.photo_studio_island!, expected.photoStudioIsland);
      check(loaded.postbox!, expected.postBox);
      check(loaded.profile!, expected.profile);
      if (wan) check(wan, expected.whereAreN);

      const player = new Player(dir, asPersonal(loaded.personal!), loaded.photo_studio_island!, loaded.postbox!, loaded.profile!, wan);
      for (const p of player.pairs()) (used.add(p.dataKey), used.add(p.headerKey));
      players.push(player);
    }

    const passthrough: SaveFiles = new Map([...files].filter(([k]) => !used.has(k)));
    return new HorizonSave(main, players, passthrough);
  }

  pairs(): EncryptedFilePair[] {
    return [this.main, ...this.players.flatMap((p) => p.pairs())];
  }

  invalidHashes(): { path: string; region: HashRegion }[] {
    return this.pairs().flatMap((p) => p.invalidHashes().map((region) => ({ path: p.path, region })));
  }

  /**
   * Replaces every occurrence of the original identity bytes with the updated ones in all files
   * (HorizonSave.ChangeIdentity). Returns the number of replacements.
   */
  changeIdentity(original: Uint8Array, updated: Uint8Array): number {
    const orig = original.slice(); // the source may live inside a file we are about to modify
    const next = updated.slice();
    let n = 0;
    for (const pair of this.pairs()) n += Math.max(0, replaceOccurrences(pair.data, orig, next));
    return n;
  }

  /**
   * Hash → encrypt (same seed for every pair, like upstream) → verify, for the pairs named in `only`
   * (all pairs when omitted). Returns the new `.dat` and `Header.dat` bytes keyed by relative path.
   * Throws, returning nothing, if any pair fails verification (decrypt mismatch or invalid hashes).
   */
  async save(seed: number, only?: Set<string>, opts: SaveOptions = {}): Promise<SaveFiles> {
    const encryptFn = opts.encryptFn ?? encrypt;
    const out: SaveFiles = new Map();
    for (const pair of this.pairs()) {
      if (only && !only.has(pair.path)) continue;
      pair.hash();
      const enc = await encryptFn(pair.data, seed, pair.header);
      const back = await decrypt(enc.header, enc.data);
      if (back.length !== pair.data.length || back.some((b, i) => b !== pair.data[i]))
        throw new Error(`Save verification failed for ${pair.path}: re-decrypted bytes differ from the edited data.`);
      const bad = pair.invalidHashes(back);
      if (bad.length) throw new Error(`Save verification failed for ${pair.path}: ${bad.length} hash region(s) invalid after save.`);
      out.set(pair.dataKey, enc.data);
      out.set(pair.headerKey, enc.header);
    }
    return out;
  }
}
