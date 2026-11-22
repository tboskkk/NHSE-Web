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
  let token = 0;
  let lastPlayer = -1;

  // Always show the bytes as read back after every mutation (app.rev) or player switch.
  $effect(() => {
    const i = app.playerIndex;
    untrack(() => { if (sel.slot && lastPlayer !== i) sel.slot = null; lastPlayer = i; });
    void app.rev;
    const mine = ++token;
    api.player(i).then((v) => { if (mine === token) p = v; });
  });
</script>

{#if p}
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
  .layout { display: flex; gap: 16px; align-items: flex-start; }
  .stack { display: flex; flex-direction: column; gap: 16px; max-width: 60rem; flex: 1; min-width: 0; }
  h1 { margin: 0; font-size: 1.3rem; }
</style>
