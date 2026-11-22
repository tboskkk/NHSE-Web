/** AES-128-CTR with a big-endian 128-bit counter (matches upstream AesCtr). */
export async function aesCtr(data: Uint8Array, key: Uint8Array, counter: Uint8Array): Promise<Uint8Array> {
  if (data.length === 0) return new Uint8Array(0);
  const k = await crypto.subtle.importKey("raw", key as BufferSource, "AES-CTR", false, ["encrypt"]);
  const out = await crypto.subtle.encrypt({ name: "AES-CTR", counter: counter as BufferSource, length: 128 }, k, data as BufferSource);
  return new Uint8Array(out);
}
