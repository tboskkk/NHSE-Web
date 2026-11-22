<script lang="ts">
  let { label, value, max, onCommit }: { label: string; value: number; max: number; onCommit: (v: number) => void } = $props();

  let draft = $state("");
  let focused = $state(false);
  const id = `nf-${Math.random().toString(36).slice(2, 8)}`;

  // Show the bytes as read back unless the user is mid-edit.
  $effect(() => {
    const v = value;
    if (!focused) draft = String(v);
  });

  const parsed = $derived(/^\d[\d,]*$/.test(draft.trim()) ? Number(draft.replaceAll(",", "")) : NaN);
  const invalid = $derived(Number.isNaN(parsed) || parsed > max);
  const message = $derived(
    draft.trim() === "" || Number.isNaN(parsed) ? "Enter a whole number." : parsed > max ? `Maximum is ${max.toLocaleString("en-US")}.` : "",
  );

  function commit() {
    focused = false;
    if (invalid) return;
    if (parsed !== value) onCommit(parsed);
    else draft = String(value);
  }
</script>

<div class="field">
  <label for={id}>{label}</label>
  <div class="row">
    <input
      {id}
      inputmode="numeric"
      class:bad={invalid}
      aria-invalid={invalid}
      aria-describedby={invalid ? `${id}-msg` : undefined}
      bind:value={draft}
      onfocus={() => (focused = true)}
      onblur={commit}
      onkeydown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); if (e.key === "Escape") { draft = String(value); (e.currentTarget as HTMLInputElement).blur(); } }}
    />
    <button type="button" onclick={() => { draft = String(max); commit(); }} disabled={value === max}>Max</button>
  </div>
  <div class="hint" id="{id}-msg" class:err={invalid}>{invalid ? message : `Limit ${max.toLocaleString("en-US")}`}</div>
</div>

<style>
  .field { display: flex; flex-direction: column; gap: 2px; }
  label { font-weight: 600; font-size: 0.85rem; }
  .row { display: flex; gap: 6px; }
  input { flex: 1; min-width: 0; text-align: right; font-variant-numeric: tabular-nums; }
  input.bad { border-color: var(--error); }
  .hint { font-size: 0.75rem; color: var(--muted); }
  .hint.err { color: var(--error); font-weight: 600; }
</style>
