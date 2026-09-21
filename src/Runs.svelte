<script>
  import { ago, elapsed } from './github.js';

  let { data, now } = $props();

  const OUTCOME = { success: 'pass', failure: 'fail', timed_out: 'fail', startup_failure: 'fail' };
  const ICON = { pass: '✓', fail: '✕', none: '–' };
  const label = (s) => s[0].toUpperCase() + s.slice(1).replaceAll('_', ' ');
</script>

{#snippet details(w)}
  <span class="mono">{w.repository.full_name}</span>
  <span class="wf"><b>{w.name}</b>{#if w.display_title && w.display_title !== w.name}<span>&nbsp;· {w.display_title}</span>{/if}</span>
  <span class="mono">{w.head_branch}</span>
  <span class="mono ev">{w.event}</span>
{/snippet}

{#if !data}
  <p class="empty">Loading…</p>
{:else}
  <div class="scroll">
    <div class="list">
      <h2>Running · {data.running.length}</h2>
      {#each data.running as w}
        <a class="row" href={w.html_url} target="_blank" rel="noreferrer">
          {#if w.status === 'in_progress'}
            <span class="chip run"><span class="dot"></span>In progress</span>
          {:else}
            <span class="chip queued"><span class="s queued"></span>{label(w.status)}</span>
          {/if}
          {@render details(w)}
          <span class="el">{elapsed(now - new Date(w.run_started_at ?? w.created_at))}</span>
        </a>
      {:else}
        <p class="empty">Nothing is running right now.</p>
      {/each}

      {#if data.finished.length}
        <h2>Just finished</h2>
        {#each data.finished as w}
          {@const o = OUTCOME[w.conclusion] ?? 'none'}
          <a class="row" href={w.html_url} target="_blank" rel="noreferrer">
            <span class="chip {o}">{ICON[o]} {label(w.conclusion ?? 'completed')}</span>
            {@render details(w)}
            <span class="el">{ago(w.updated_at, now)} ago</span>
          </a>
        {/each}
      {/if}

      {#each data.errors as msg}<p class="err">{msg}</p>{/each}
    </div>
  </div>
{/if}

<style>
  .scroll { overflow-x: auto; }
  .list { min-width: 620px; max-width: 1200px; margin: 0 auto; padding: 0 16px; display: grid; }
  .list > .empty { padding-inline: 0; }
  .list > .err { margin-top: 8px; }
  h2 { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin: 0; padding: 14px 0 6px; }
  .row {
    display: grid; grid-template-columns: 116px 150px minmax(0, 1fr) 170px 110px 64px; gap: 12px; align-items: center;
    padding: 8px 0; border-top: 1px solid var(--line); font-size: 13px;
  }
  .row:hover { text-decoration: none; background: var(--sunk); }
  .row > :global(*) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .wf span { color: var(--muted); }
  .mono { font: 12px var(--mono); color: var(--muted); }
  .el { text-align: right; font-variant-numeric: tabular-nums; color: var(--muted); }
  .chip .s.queued { width: 9px; height: 9px; }
  @media (max-width: 960px) {
    .row { grid-template-columns: 116px 120px minmax(0, 1fr) 130px 64px; }
    .ev { display: none; }
  }
</style>
