<script lang="ts">
  import { app, type Section } from "../lib/state.svelte";

  const soon: { id: Section; label: string }[] = [
    { id: "villagers", label: "Villagers" },
    { id: "collections", label: "Collections" },
    { id: "island", label: "Island" },
  ];
</script>

<nav aria-label="Sections">
  <h2>Players</h2>
  {#each app.loaded?.players ?? [] as p (p.index)}
    <button
      class="item"
      class:active={app.section === "player" && app.playerIndex === p.index}
      aria-current={app.section === "player" && app.playerIndex === p.index ? "page" : undefined}
      onclick={() => { app.section = "player"; app.playerIndex = p.index; }}
    >{p.name}</button>
  {/each}
  <h2>Island</h2>
  <button class="item" class:active={app.section === "map"} aria-current={app.section === "map" ? "page" : undefined} onclick={() => (app.section = "map")}>Map</button>
  {#each soon as s (s.id)}
    <button class="item" disabled>{s.label} <span class="tag">coming soon</span></button>
  {/each}
</nav>

<style>
  nav { display: flex; flex-direction: column; gap: 2px; padding: 12px; width: 13rem; flex: none; background: var(--surface); border-right: 1px solid var(--border); overflow-y: auto; }
  h2 { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 12px 8px 4px; }
  .item { text-align: left; border-color: transparent; background: transparent; }
  .item.active { background: var(--surface-2); border-color: var(--border); font-weight: 600; }
  .tag { font-size: 0.65rem; color: var(--muted); border: 1px solid var(--border); border-radius: 999px; padding: 0 6px; margin-left: 4px; }
  @media (max-width: 640px) { nav { width: 100%; flex-direction: row; flex-wrap: wrap; border-right: 0; border-bottom: 1px solid var(--border); } h2 { display: none; } }
</style>
