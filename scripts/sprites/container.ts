/** zstd (`.zs`) and SARC readers for ACNH romfs files. */

export function unzs(data: Uint8Array): Uint8Array {
  return Bun.zstdDecompressSync(data);
}

/** Every file in a SARC archive, keyed by its path inside the archive. */
export function readSarc(d: Uint8Array): Map<string, Uint8Array> {
  if (d.length < 0x14 || String.fromCharCode(...d.subarray(0, 4)) !== "SARC") throw new Error("not a SARC archive");
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const le = v.getUint16(6, false) === 0xfffe;
  const hdr = v.getUint16(4, le);
  const dataOff = v.getUint32(0x0c, le);
  if (String.fromCharCode(...d.subarray(hdr, hdr + 4)) !== "SFAT") throw new Error("SARC: missing SFAT");
  const count = v.getUint16(hdr + 6, le);
  const sfat = hdr + 12;
  const namesOff = sfat + count * 16 + 8;
  const out = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    const e = sfat + i * 16;
    const no = namesOff + (v.getUint32(e + 4, le) & 0xffffff) * 4;
    let end = no;
    while (d[end] !== 0) end++;
    out.set(new TextDecoder().decode(d.subarray(no, end)), d.slice(dataOff + v.getUint32(e + 8, le), dataOff + v.getUint32(e + 12, le)));
  }
  return out;
}
