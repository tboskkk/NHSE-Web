/// <reference lib="webworker" />
import { createApi } from "./handlers";
import type { Request, Response } from "./protocol";

const base = import.meta.env.BASE_URL;
const api = createApi(async (path) => {
  const r = await fetch(`${base}${path}`);
  if (!r.ok) throw new Error(`Failed to fetch ${path} (${r.status})`);
  return r.json();
});

const post = (msg: Response, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);

/** Collects Uint8Array buffers from a SaveFiles map result so they transfer instead of copy. */
function buffers(value: unknown): Transferable[] {
  if (!(value instanceof Map)) return [];
  const seen = new Set<ArrayBufferLike>();
  for (const v of value.values()) if (v instanceof Uint8Array) seen.add(v.buffer);
  return [...seen] as Transferable[];
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, method, args } = e.data;
  try {
    const value = await (api[method] as (...a: unknown[]) => Promise<unknown>)(...args);
    post({ id, ok: true, value }, buffers(value));
  } catch (err) {
    post({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
