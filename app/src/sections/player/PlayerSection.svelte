<script lang="ts">
  import { api, app } from "../../lib/state.svelte";
  import type { PlayerView } from "../../worker/protocol";
  import MoneyCard from "./MoneyCard.svelte";
  import ProfileCard from "./ProfileCard.svelte";

  let p = $state<PlayerView | null>(null);
  let token = 0;

  // Always show the bytes as read back after every mutation (app.rev) or player switch.
  $effect(() => {
    const i = app.playerIndex;
    void app.rev;
    const mine = ++token;
    api.player(i).then((v) => { if (mine === token) p = v; });
  });
</script>

{#if p}
  <div class="stack">
    <h1>{p.name}</h1>
    <ProfileCard {p} />
    <MoneyCard {p} />
    <!-- Inventory (Task 12) -->
  </div>
{/if}

<style>
  .stack { display: flex; flex-direction: column; gap: 16px; max-width: 60rem; }
  h1 { margin: 0; font-size: 1.3rem; }
</style>
