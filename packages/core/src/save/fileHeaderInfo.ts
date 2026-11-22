import { u16, u32 } from "../util/bytes";
import type { FileHeaderInfo } from "./revisions";

export const FILE_HEADER_INFO_SIZE = 0x40;

/** Reads the identifying prefix of a `*Header.dat` file (FileHeaderInfo layout). */
export function readFileHeaderInfo(header: Uint8Array): FileHeaderInfo {
  return {
    major: u32(header, 0x00),
    minor: u32(header, 0x04),
    unk1: u16(header, 0x08),
    headerRevision: u16(header, 0x0a),
    unk2: u16(header, 0x0c),
    saveRevision: u16(header, 0x0e),
  };
}
