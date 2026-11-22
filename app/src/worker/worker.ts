/// <reference lib="webworker" />
import { createApi } from "./handlers";
import type { Request, Response } from "./protocol";
import { transferables } from "./transfer";

const base = import.meta.env.BASE_URL;
const get = async (path: string) => {
  const r = await fetch(`${base}${path}`);
  if (!r.ok) throw new Error(`Failed to fetch ${path} (${r.status})`);
  return r;
};
const api = createApi(
  async (path) => (await get(path)).json(),
  async (path) => new Uint8Array(await (await get(path)).arrayBuffer()),
);

const post = (msg: Response, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, method, args } = e.data;
  try {
    const value = await (api[method] as (...a: unknown[]) => Promise<unknown>)(...args);
    post({ id, ok: true, value }, transferables(value));
  } catch (err) {
    post({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
