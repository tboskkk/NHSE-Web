import revisionData from "../generated/revisions.json";

/** Decoded 0x10-byte file header prefix (FileHeaderInfo). */
export type FileHeaderInfo = {
  major: number;
  minor: number;
  unk1: number;
  headerRevision: number;
  unk2: number;
  saveRevision: number;
};

export type HashRegion = { hashOffset: number; start: number; length: number };
export type HashFile = { size: number; regions: HashRegion[] };

export type Revision = {
  index: number;
  label: string;
  header: FileHeaderInfo;
  sizes: { main: number; personal: number; photoStudioIsland: number; postBox: number; profile: number; whereAreN: number };
  hash: Record<string, HashFile | null>;
  personalOffsets: Record<string, number>;
};

export const REVISIONS: readonly Revision[] = revisionData as unknown as Revision[];

/** Exact-match revision lookup (RevisionChecker.GetKnownRevisionIndex). */
export function findRevision(h: FileHeaderInfo): Revision | undefined {
  return REVISIONS.find(
    (r) =>
      r.header.major === h.major &&
      r.header.minor === h.minor &&
      r.header.unk1 === h.unk1 &&
      r.header.headerRevision === h.headerRevision &&
      r.header.unk2 === h.unk2 &&
      r.header.saveRevision === h.saveRevision,
  );
}
