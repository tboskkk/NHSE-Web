import type { Api, Request, Response } from "../worker/protocol";

/** Main-thread client: same Api interface, backed by the worker. Errors rethrow with the worker's message. */
export function createClient(): Api {
  const worker = new Worker(new URL("../worker/worker.ts", import.meta.url), { type: "module" });
  let next = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  worker.onmessage = (e: MessageEvent<Response>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.ok) p.resolve(e.data.value);
    else p.reject(new Error(e.data.error));
  };
  const call = (method: keyof Api, args: unknown[]) =>
    new Promise((resolve, reject) => {
      const id = next++;
      pending.set(id, { resolve, reject });
      const transfer = method === "load" ? [...(args[0] as Map<string, Uint8Array>).values()].map((v) => v.buffer) : [];
      worker.postMessage({ id, method, args } satisfies Request, transfer);
    });
  return new Proxy({} as Api, { get: (_t, method: string) => (...args: unknown[]) => call(method as keyof Api, args) });
}
