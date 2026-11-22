<script lang="ts">
  import { api, app, edit } from "../../lib/state.svelte";
  import type { PlayerView } from "../../worker/protocol";

  let { p }: { p: PlayerView } = $props();

  // Upstream GameLists.Fruits (item ids), named from the loaded language.
  const FRUIT_IDS = [2213, 2287, 2214, 2286, 2285];
  const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  let fruitNames = $state<Record<number, string>>({});
  $effect(() => {
    const lang = app.lang;
    api.itemCatalog(lang).then((cat) => {
      const m: Record<number, string> = {};
      for (const c of cat) if (FRUIT_IDS.includes(c.id)) m[c.id] = c.name;
      fruitNames = m;
    });
  });

  let name = $state("");
  let town = $state("");
  $effect(() => { name = p.name; });
  $effect(() => { town = p.townName; });

  const days = $derived(Array.from({ length: MONTH_DAYS[Math.max(0, p.birthday.month - 1)] ?? 31 }, (_, i) => i + 1));
  const ID_TIP = "Identity values link this player across files. Editing them can break the save.";

  const commitName = () => {
    const v = name.trim();
    if (!v) { name = p.name; return; }
    if (v !== p.name) edit({ op: "playerName", player: p.index, value: v });
  };
  const commitTown = () => {
    const v = town.trim();
    if (!v) { town = p.townName; return; }
    if (v !== p.townName) edit({ op: "townName", value: v });
  };
  const setBirthday = (month: number, day: number) => {
    day = Math.min(day, MONTH_DAYS[month - 1] ?? 31);
    if (month !== p.birthday.month || day !== p.birthday.day) edit({ op: "birthday", player: p.index, month, day });
  };
</script>

<section class="card">
  <h2>Profile</h2>
  <div class="grid">
    <div class="field">
      <label for="pname">Player name</label>
      <input id="pname" maxlength="10" bind:value={name} onblur={commitName} onkeydown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} />
      <div class="hint">{name.length}/10</div>
    </div>
    <div class="field">
      <label for="tname">Town name <span class="muted">(affects all residents)</span></label>
      <input id="tname" maxlength="10" bind:value={town} onblur={commitTown} onkeydown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} />
      <div class="hint">{town.length}/10</div>
    </div>
    <div class="field">
      <label for="bmonth">Birthday</label>
      <div class="row">
        <select id="bmonth" value={p.birthday.month} onchange={(e) => setBirthday(Number(e.currentTarget.value), p.birthday.day)}>
          {#each MONTHS as m, i (m)}<option value={i + 1}>{m}</option>{/each}
        </select>
        <select aria-label="Birthday day" value={p.birthday.day} onchange={(e) => setBirthday(p.birthday.month, Number(e.currentTarget.value))}>
          {#each days as d (d)}<option value={d}>{d}</option>{/each}
        </select>
      </div>
    </div>
    <div class="field">
      <label for="fruit">Native fruit</label>
      <select id="fruit" value={p.profileFruit} onchange={(e) => edit({ op: "profileFruit", player: p.index, value: Number(e.currentTarget.value) })}>
        {#if !FRUIT_IDS.includes(p.profileFruit)}<option value={p.profileFruit}>Unknown ({p.profileFruit})</option>{/if}
        {#each FRUIT_IDS as id (id)}<option value={id}>{fruitNames[id] ?? `#${id}`}</option>{/each}
      </select>
    </div>
    <div class="field" title={ID_TIP}>
      <label for="pid">Player ID</label>
      <input id="pid" readonly value={p.playerId} title={ID_TIP} />
    </div>
    <div class="field" title={ID_TIP}>
      <label for="tid">Town ID</label>
      <input id="tid" readonly value={p.townId} title={ID_TIP} />
    </div>
  </div>
</section>

<style>
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 16px; }
  h2 { margin: 0 0 8px; font-size: 1rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr)); gap: 12px 16px; }
  .field { display: flex; flex-direction: column; gap: 2px; }
  label { font-weight: 600; font-size: 0.85rem; }
  .row { display: flex; gap: 6px; }
  .row select { flex: 1; }
  select { font: inherit; color: inherit; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 6px 8px; }
  input[readonly] { color: var(--muted); background: var(--surface-2); }
  .hint { font-size: 0.75rem; color: var(--muted); text-align: right; }
</style>
