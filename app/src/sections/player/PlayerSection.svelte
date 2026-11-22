<script lang="ts">
  import { untrack } from "svelte";
  import { api, app } from "../../lib/state.svelte";
  import type { PlayerView } from "../../worker/protocol";
  import { sel } from "../../lib/selection.svelte";
  import InventoryCard from "./InventoryCard.svelte";
  import ItemPicker from "./ItemPicker.svelte";
  import MoneyCard from "./MoneyCard.svelte";
  import ProfileCard from "./ProfileCard.svelte";

  let p = $state<PlayerView | null>(null);
  let error = $state<string | null>(null);
  let token = 0;
  let lastPlayer = -1;

  // Always show the bytes as read back after every mutation (app.rev) or player switch.
  $effect(() => {
    const i = app.playerIndex;
    untrack(() => { if (sel.slot && lastPlayer !== i) sel.slot = null; lastPlayer = i; });
    void app.rev;
    const mine = ++token;
    api.player(i).then(
      (v) => { if (mine === token) { p = v; error = null; } },
      (e) => { if (mine === token) { p = null; error = e instanceof Error ? e.message : String(e); } },
    );
  });
</script>

{#if error}
  <p class="err" role="alert">This player could not be read: {error}. The save may be damaged; nothing was changed.</p>
{:else if p}
  <div class="layout">
    <div class="stack">
      <h1>{p.name}</h1>
      <ProfileCard {p} />
      <MoneyCard {p} />
      <InventoryCard {p} />
    </div>
    <ItemPicker {p} />
  </div>
{/if}

<style>
  .err { color: var(--error); font-weight: 600; }
  .layout { display: flex; gap: 16px; align-items: flex-start; }
  .stack { display: flex; flex-direction: column; gap: 16px; max-width: 60rem; flex: 1; min-width: 0; }
  h1 { margin: 0; font-size: 1.3rem; }
</style>
