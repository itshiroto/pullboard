<script>
  import { ago } from './github.js';

  let { result, now } = $props();

  const LABEL = { pass: 'Open · checks passing', fail: 'Open · checks failing', run: 'Open · checks running', none: 'Open · no checks' };
  const ICON = { pass: '✓', fail: '✕', none: '–' };
</script>

{#if !result}
  <p class="empty">Searching…</p>
{:else}
  <div class="list">
    <h2>{result.total} {result.total === 1 ? 'result' : 'results'}{#if result.total > result.prs.length}&nbsp;· showing {result.prs.length}{/if}</h2>
    {#each result.prs as pr}
      <div class="row" class:done={pr.state !== 'open'}>
        {#if pr.state === 'open'}
          <a class="s {pr.ci}" href="{pr.url}/checks" target="_blank" rel="noreferrer" title={LABEL[pr.ci]} aria-label={LABEL[pr.ci]}>
            {#if pr.ci === 'run'}<span class="dot"></span>{:else}{ICON[pr.ci]}{/if}
          </a>
        {:else}
          <span class="s {pr.state === 'merged' ? 'merged' : 'none'}" title={pr.state === 'merged' ? 'Merged' : 'Closed without merging'}
            aria-label={pr.state === 'merged' ? 'Merged' : 'Closed without merging'}>{pr.state === 'merged' ? '✓' : '✕'}</span>
        {/if}
        <div>
          <a class="t" href={pr.url} target="_blank" rel="noreferrer">{pr.title}</a>
          {#if pr.draft && pr.state === 'open'}<span class="tag">Draft</span>{/if}
          <div class="m">{pr.repo}#{pr.number} · @{pr.author} · {pr.state === 'open' ? 'updated' : pr.state} {ago(pr.closedAt ?? pr.updatedAt, now)} · {pr.base} ← {pr.head}</div>
        </div>
      </div>
    {:else}
      <p class="empty">No pull requests match.</p>
    {/each}
  </div>
{/if}

<style>
  .list { max-width: 960px; margin: 0 auto; padding: 0 16px; }
  .list > .empty { padding-inline: 0; }
  h2 { font: 600 12px var(--mono); letter-spacing: 0.02em; color: var(--muted); margin: 0; padding: 6px 0; }
  .row { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 10px; padding: 9px 0; border-top: 1px solid var(--line); }
  .row .s:hover { text-decoration: none; }
  .t { font-size: 13.5px; font-weight: 500; line-height: 1.35; overflow-wrap: anywhere; }
  .done .t { font-weight: 400; color: var(--muted); }
  .m { font: 11.5px/1.4 var(--mono); color: var(--muted); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tag { font-size: 10.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); border: 1px solid var(--line); border-radius: 4px; padding: 1px 4px; margin-left: 4px; vertical-align: 1px; }
</style>
