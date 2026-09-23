<script>
  import { ago, elapsed } from './github.js';

  let { data, now } = $props();

  const OUTCOME = { success: 'pass', failure: 'fail', timed_out: 'fail', startup_failure: 'fail' };
  const ICON = { pass: '✓', fail: '✕', none: '–' };
  const label = (s) => s[0].toUpperCase() + s.slice(1).replaceAll('_', ' ');
</script>

{#if !data}
  <p class="empty">Loading…</p>
{:else}
  <div class="scroll">
    <div class="list">
      {#each data.groups as g}
        <h2>{g.repo} · {g.runs.length}</h2>
        {#each g.runs as w}
          {@const o = OUTCOME[w.conclusion] ?? 'none'}
          <a class="row" href={w.html_url} target="_blank" rel="noreferrer">
            {#if w.status === 'in_progress'}
              <span class="chip run"><span class="dot"></span>In progress</span>
            {:else if w.status !== 'completed'}
              <span class="chip queued"><span class="s queued"></span>{label(w.status)}</span>
            {:else}
              <span class="chip {o}">{ICON[o]} {label(w.conclusion ?? 'completed')}</span>
            {/if}
            <span class="wf"><b>{w.name}</b>{#if w.display_title && w.display_title !== w.name}<span>&nbsp;· {w.display_title}</span>{/if}</span>
            <span class="mono">{w.head_branch}</span>
            <span class="mono ev">{w.event}</span>
            {#if w.status === 'completed'}
              <span class="el">{ago(w.updated_at, now)} ago</span>
            {:else}
              <span class="el">{elapsed(now - new Date(w.run_started_at ?? w.created_at))}</span>
            {/if}
          </a>
        {/each}
      {:else}
        <p class="empty">No workflow runs found.</p>
      {/each}

      {#each data.errors as msg}<p class="err">{msg}</p>{/each}
    </div>
  </div>
{/if}

<style>
  .scroll { overflow-x: auto; }
  .list { min-width: 620px; max-width: 1200px; margin: 0 auto; padding: 0 16px; display: grid; }
  .list > .empty { padding-inline: 0; }
  .list > .err { margin-top: 8px; }
  h2 { font: 600 12px var(--mono); letter-spacing: 0.02em; color: var(--muted); margin: 0; padding: 18px 0 6px; }
  .row {
    display: grid; grid-template-columns: 116px minmax(0, 1fr) 170px 110px 64px; gap: 12px; align-items: center;
    padding: 8px 0; border-top: 1px solid var(--line); font-size: 13px;
  }
  .row:hover { text-decoration: none; background: var(--sunk); }
  .row > :global(*) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .wf span { color: var(--muted); }
  .mono { font: 12px var(--mono); color: var(--muted); }
  .el { text-align: right; font-variant-numeric: tabular-nums; color: var(--muted); }
  .chip .s.queued { width: 9px; height: 9px; }
  @media (max-width: 960px) {
    .row { grid-template-columns: 116px minmax(0, 1fr) 130px 64px; }
    .ev { display: none; }
  }
</style>
