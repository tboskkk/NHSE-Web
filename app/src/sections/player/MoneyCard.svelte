<script lang="ts">
  import type { EditOp } from "@nhse/core";
  import { app, edit } from "../../lib/state.svelte";
  import type { PlayerView } from "../../worker/protocol";
  import NumberField from "./NumberField.svelte";

  let { p }: { p: PlayerView } = $props();

  const U32 = 4_294_967_295;
  const lim = (n: number) => (app.advanced ? U32 : n);
  const set = (op: "wallet" | "bank" | "nookMiles" | "totalNookMiles" | "hotelTickets" | "pocketCount" | "bagCount" | "itemChestCount") =>
    (value: number) => edit({ op, player: p.index, value } as EditOp);
</script>

<section class="card">
  <h2>Money</h2>
  <div class="grid">
    <NumberField label="Wallet (Bells)" value={p.wallet} max={lim(99_999)} onCommit={set("wallet")} />
    <NumberField label="Bank (Bells)" value={p.bank} max={lim(999_999_999)} onCommit={set("bank")} />
    <NumberField label="Nook Miles" value={p.nookMiles} max={lim(U32)} onCommit={set("nookMiles")} />
    <NumberField label="Total Nook Miles" value={p.totalNookMiles} max={lim(U32)} onCommit={set("totalNookMiles")} />
    {#if p.hotelTickets !== null}
      <NumberField label="Hotel tickets" value={p.hotelTickets} max={lim(U32)} onCommit={set("hotelTickets")} />
    {/if}
  </div>
  <h2 class="sub">Unlocked slots</h2>
  <div class="grid">
    <NumberField label="Pocket slots (1–20)" value={p.pocketCount} max={lim(p.slotCounts.pocket)} onCommit={set("pocketCount")} />
    <NumberField label="Bag slots (21–40)" value={p.bagCount} max={lim(p.slotCounts.bag)} onCommit={set("bagCount")} />
    <NumberField label="Storage slots" value={p.itemChestCount} max={lim(p.slotCounts.itemChest)} onCommit={set("itemChestCount")} />
  </div>
  <label class="adv"><input type="checkbox" bind:checked={app.advanced} /> Advanced: lift range limits (never bypasses save integrity)</label>
</section>

<style>
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 16px; }
  h2 { margin: 0 0 8px; font-size: 1rem; }
  h2.sub { margin-top: 16px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr)); gap: 12px 16px; }
  .adv { display: block; margin-top: 14px; font-size: 0.85rem; color: var(--muted); }
</style>
