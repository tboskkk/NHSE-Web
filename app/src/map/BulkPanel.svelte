<script lang="ts">
  import { Item } from "@nhse/core";
  import { api, edit, showToast } from "../lib/state.svelte";
  import type { PlanRequest, PlanResult } from "../worker/protocol";

  let { brush, brushName }: { brush: bigint; brushName: string } = $props();

  let scope = $state<"0" | "1" | "both">("both");
  let from = $state<bigint | null>(null);
  let pending = $state<{ req: PlanRequest; plan: PlanResult } | null>(null);
  let busy = $state(false);

  const hex = (r: bigint) => r.toString(16).padStart(16, "0");
  const layer = () => (scope === "both" ? "both" : (Number(scope) as 0 | 1));

  async function plan(req: PlanRequest) {
    busy = true;
    try {
      const p = await api.mapPlan(req);
      if (!p.op) showToast(p.skipped ? `Nothing can be changed (${p.skipped} skipped: ${p.sample[0]?.reason}).` : "Nothing to change.");
      else pending = { req, plan: p };
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      busy = false;
    }
  }
  async function confirm() {
    const p = pending;
    pending = null;
    if (p?.plan.op) await edit(p.plan.op);
  }
  const summary = (p: PlanResult) => {
    const c = p.counts;
    const bits = [c.erased && `remove ${c.erased}`, c.replaced && `replace ${c.replaced}`, c.placed && `place ${c.placed}`].filter(Boolean).join(", ");
    return `${bits}${p.skipped ? `; ${p.skipped} skipped (${p.sample[0]?.reason})` : ""}`;
  };
</script>

<section aria-label="Bulk actions">
  <h2>Bulk actions</h2>
  <label>Scope
    <select bind:value={scope}><option value="both">Both layers</option><option value="0">Layer 1</option><option value="1">Layer 2</option></select>
  </label>
  <div class="row">
    <button data-testid="bulk-weeds" disabled={busy} onclick={() => plan({ tool: "removeWeeds", layer: layer() })}>Remove all weeds</button>
    <button disabled={busy || brush === 0xfffen} onclick={() => plan({ tool: "removeItem", layer: layer(), id: Number(brush & 0xffffn) })}>Remove all {brushName}</button>
  </div>
  <div class="row">
    <button disabled={brush === 0xfffen} onclick={() => (from = brush)}>Set “from” = {brushName}</button>
    <button disabled={busy || from === null || brush === 0xfffen} onclick={() => from !== null && plan({ tool: "replaceAll", layer: layer(), from: hex(from), to: hex(brush), match: "id" })}>
      Replace {from === null ? "…" : new Item(from).itemId} with brush
    </button>
  </div>
  {#if pending}
    <div class="confirm" role="alertdialog" aria-label="Confirm bulk action">
      <p data-testid="bulk-summary">{summary(pending.plan)}</p>
      <button data-testid="bulk-confirm" class="primary" onclick={confirm}>Apply</button>
      <button onclick={() => (pending = null)}>Cancel</button>
    </div>
  {/if}
</section>

<style>
  section { display: flex; flex-direction: column; gap: 8px; }
  h2 { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 0; }
  .row { display: flex; flex-wrap: wrap; gap: 6px; }
  .confirm { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); padding: 8px; }
  .confirm p { margin: 0 0 6px; }
</style>
