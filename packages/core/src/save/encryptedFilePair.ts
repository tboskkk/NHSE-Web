import { murmur3 } from "../crypto/murmur3";
import { decrypt } from "../crypto/encryption";
import { setU32, u32 } from "../util/bytes";
import { SaveLoadError } from "./errors";
import { readFileHeaderInfo } from "./fileHeaderInfo";
import { findRevision, type HashRegion, type Revision } from "./revisions";
import type { SaveFiles } from "./types";

/** A `<name>.dat` + `<name>Header.dat` pair with its decrypted data (EncryptedFilePair). */
export class EncryptedFilePair {
  constructor(
    /** Path without extension, relative to the save root: "main" or "Villager0/personal". */
    readonly path: string,
    public data: Uint8Array,
    public header: Uint8Array,
    readonly revision: Revision,
  ) {}

  get dataKey(): string {
    return `${this.path}.dat`;
  }
  get headerKey(): string {
    return `${this.path}Header.dat`;
  }

  /** Whether both files of the pair exist in `files`. */
  static exists(files: SaveFiles, path: string): boolean {
    return files.has(`${path}.dat`) && files.has(`${path}Header.dat`);
  }

  /** Reads, identifies and decrypts a pair. Throws SaveLoadError for unknown revisions. */
  static async read(files: SaveFiles, path: string): Promise<{ data: Uint8Array; header: Uint8Array; revision: Revision }> {
    const header = files.get(`${path}Header.dat`)!;
    const raw = files.get(`${path}.dat`)!;
    if (header.length < 0x300)
      throw new SaveLoadError("size-mismatch", `${path}Header.dat is ${header.length} bytes; expected at least 768.`);
    const info = readFileHeaderInfo(header);
    const revision = findRevision(info);
    if (!revision)
      throw new SaveLoadError(
        "unknown-revision",
        `Game version not supported yet (${path}Header.dat: major 0x${info.major.toString(16)}, minor 0x${info.minor.toString(16)}, revision ${info.saveRevision}).`,
      );
    return { data: await decrypt(header, raw), header: header.slice(), revision };
  }

  private regions(): HashRegion[] {
    const name = `${this.path.split("/").pop()}.dat`;
    const file = this.revision.hash[name];
    if (!file) throw new Error(`No hash table for ${name} in revision ${this.revision.label}`);
    return file.regions;
  }

  /** Recomputes every hash region of `data` in place. */
  hash(): void {
    for (const r of this.regions()) setU32(this.data, r.hashOffset, murmur3(this.data.subarray(r.start, r.start + r.length)));
  }

  /** Regions whose stored hash does not match the data. */
  invalidHashes(data: Uint8Array = this.data): HashRegion[] {
    return this.regions().filter((r) => murmur3(data.subarray(r.start, r.start + r.length)) !== u32(data, r.hashOffset));
  }
}
