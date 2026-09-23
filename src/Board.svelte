<script>
  import { ago } from './github.js';

  let { categories, data, now } = $props();

  const LABEL = { pass: 'Checks passing', fail: 'Checks failing', run: 'Checks running', none: 'No checks' };
  const ICON = { pass: '✓', fail: '✕', none: '–' };

  const failing = (d) => d.prs.filter((p) => p.ci === 'fail').length;

  function stats(repos) {
    let open = 0, fail = 0, broken = 0;
    for (const repo of repos) {
      const d = data?.[repo];
      if (d?.error) broken++;
      else if (d) { open += d.total; fail += failing(d); }
    }
    return { open, fail, broken };
  }
</script>

{#each categories as cat}
  {@const s = stats(cat.repos)}
  <details class="cat" open>
    <summary>
      <span class="caret" aria-hidden="true"></span>
      <span class="name">{cat.name}</span>
      <span class="sum">
        {cat.repos.length} {cat.repos.length === 1 ? 'repo' : 'repos'} · {s.open} open{#if s.fail}&nbsp;· <b>{s.fail} failing</b>{/if}{#if s.broken}&nbsp;· <b>{s.broken} can't be read</b>{/if}
      </span>
    </summary>
    <div class="row">
      {#each cat.repos as repo}
        {@const d = data?.[repo]}
        <section class="col">
          <header>
            <a class="repo" href="https://github.com/{repo}/pulls" target="_blank" rel="noreferrer">{repo}</a>
            {#if d && !d.error}
              <span class="count">{d.total} open{#if failing(d)}&nbsp;· <b>{failing(d)} failing</b>{/if}</span>
            {/if}
          </header>
          {#if !d}
            <p class="empty">Loading…</p>
          {:else if d.error}
            <p class="err">{d.error}</p>
          {:else if !d.prs.length}
            <p class="empty">No open PRs</p>
          {:else}
            <ul class="cards">
              {#each d.prs as pr}
                <li class="card" class:draft={pr.draft}>
                  <a class="s {pr.ci}" href="{pr.url}/checks" target="_blank" rel="noreferrer" title={LABEL[pr.ci]} aria-label={LABEL[pr.ci]}>
                    {#if pr.ci === 'run'}<span class="dot"></span>{:else}{ICON[pr.ci]}{/if}
                  </a>
                  <div>
                    <a class="t" href={pr.url} target="_blank" rel="noreferrer">{pr.title}</a>
                    {#if pr.draft}<span class="tag">Draft</span>{/if}
                    <div class="m">#{pr.number} · @{pr.author} · {ago(pr.updatedAt, now)}</div>
                    <div class="m br" title="{pr.head} into {pr.base}">{pr.base} ← {pr.head}</div>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
          {#if d?.closed?.length}
            <details class="closed">
              <summary><span class="caret" aria-hidden="true"></span>Recently closed · {d.closed.length}</summary>
              <ul class="cards">
                {#each d.closed as pr}
                  <li class="card">
                    <span class="s {pr.merged ? 'merged' : 'none'}" title={pr.merged ? 'Merged' : 'Closed without merging'}
                      aria-label={pr.merged ? 'Merged' : 'Closed without merging'}>{pr.merged ? '✓' : '✕'}</span>
                    <div>
                      <a class="t" href={pr.url} target="_blank" rel="noreferrer">{pr.title}</a>
                      <div class="m">#{pr.number} · @{pr.author} · {pr.merged ? 'merged' : 'closed'} {ago(pr.closedAt, now)}</div>
                      <div class="m br" title="{pr.head} into {pr.base}">{pr.base} ← {pr.head}</div>
                    </div>
                  </li>
                {/each}
              </ul>
            </details>
          {/if}
        </section>
      {/each}
    </div>
  </details>
{/each}

<style>
  .cat + .cat { border-top: 1px solid var(--line); }
  summary { list-style: none; cursor: pointer; }
  summary::-webkit-details-marker { display: none; }
  .cat > summary { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 10px; padding: 12px 16px; }
  .cat[open] > summary { padding-bottom: 2px; }
  /* Chevron drawn with two borders: points right when collapsed, down when open. */
  .caret { flex: none; align-self: center; width: 9px; height: 9px; margin: 0 3px 3px 2px; border: solid var(--muted); border-width: 0 2.5px 2.5px 0; transform: rotate(-45deg); transition: transform 0.15s; }
  [open] > summary .caret { transform: rotate(45deg); }
  .name { font-size: 15px; font-weight: 700; }
  .sum { font-size: 12.5px; color: var(--muted); }
  .sum b, .count b { color: var(--fail); font-weight: 600; }

  .row { display: flex; gap: 12px; padding: 10px 16px 16px; overflow-x: auto; align-items: flex-start; }
  .col { flex: 0 0 288px; min-width: 0; background: var(--sunk); border-radius: 8px; padding-bottom: 8px; }
  .col header { display: flex; align-items: baseline; gap: 8px; padding: 10px 12px 6px; }
  .repo { font: 500 13px/1.3 var(--mono); overflow-wrap: anywhere; }
  .count { font-size: 12px; color: var(--muted); margin-left: auto; white-space: nowrap; }
  .col > .err, .col > .empty { margin: 4px 8px 0; }

  /* Columns stop growing so one busy repo doesn't stretch its row; the cards scroll instead.
     520px keeps at least 4 cards in view on short screens, even with 3-line titles and a wrapped meta line. */
  .cards { list-style: none; margin: 0; padding: 4px 8px 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; max-height: max(60vh, 520px); overflow-y: auto; }
  .card { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 9px; padding: 9px 10px; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; }
  .card .s:hover { text-decoration: none; }
  .card.draft { opacity: 0.62; }
  .t { font-size: 13.5px; font-weight: 500; line-height: 1.35; overflow-wrap: anywhere; }
  .m { font: 11.5px/1.4 var(--mono); color: var(--muted); margin-top: 3px; }
  /* Closed PRs are history: flatter cards under a small label. */
  .closed > summary { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); padding: 12px 12px 2px; }
  .closed .caret { width: 7px; height: 7px; border-width: 0 2px 2px 0; margin: 0 1px 2px 2px; }
  .closed .cards { max-height: none; }
  .closed .card { background: transparent; }
  .closed .t { font-weight: 400; color: var(--muted); }
  .br { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }
  .tag { font-size: 10.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); border: 1px solid var(--line); border-radius: 4px; padding: 1px 4px; margin-left: 4px; vertical-align: 1px; }
  @media (prefers-reduced-motion: reduce) { .caret { transition: none; } }
</style>
