<script>
  import Board from './Board.svelte';
  import Runs from './Runs.svelte';
  import { parseCategories, uniqueRepos, fetchBoard, fetchRuns, poll, ago } from './github.js';

  const REFRESH_MS = 30_000;
  const TOKEN_KEY = 'pullboard.token';
  const CATS_KEY = 'pullboard.categories';

  const savedToken = localStorage.getItem(TOKEN_KEY) ?? '';
  const savedCats = localStorage.getItem(CATS_KEY) ?? '';

  let token = $state(savedToken);
  let catText = $state(savedCats);
  const categories = $derived(parseCategories(catText).categories);
  const repos = $derived(uniqueRepos(categories));

  const viewFromHash = () => (location.hash === '#/runs' ? 'runs' : 'board');
  let view = $state(viewFromHash());

  let board = $state.raw(null);
  let runs = $state.raw(null);
  let error = $state('');
  let updated = $state(0);
  let now = $state(Date.now());
  let refresh = $state(() => {});

  let editing = $state(!savedToken || !parseCategories(savedCats).categories.length);
  let draftToken = $state(savedToken);
  let draftCats = $state(savedCats);
  let formErrors = $state([]);

  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  // Only the view on screen polls. Re-runs when the view, token or repo list changes.
  $effect(() => {
    const [v, t, r] = [view, token, repos];
    error = '';
    if (!t || !r.length) return;
    const p = poll(async () => {
      try {
        if (v === 'runs') runs = await fetchRuns(t, r);
        else board = await fetchBoard(t, r);
        updated = Date.now();
        error = '';
      } catch (e) {
        error = describe(e);
        if (e.status === 401) openSettings();
      }
    }, REFRESH_MS);
    refresh = p.refresh;
    return p.stop;
  });

  function describe(e) {
    if (e.status === 401) return 'GitHub rejected the token. Paste a new one in Settings.';
    if (e.rate) return `GitHub rate limit reached.${e.reset ? ` It resets at ${e.reset.toLocaleTimeString()}.` : ''}`;
    return `GitHub request failed: ${e.message}`;
  }

  function openSettings() {
    draftToken = token;
    draftCats = catText;
    formErrors = [];
    editing = true;
  }

  function save(e) {
    e.preventDefault();
    const { categories: parsed, errors } = parseCategories(draftCats);
    if (!draftToken.trim()) errors.unshift('Paste a GitHub token.');
    if (!parsed.length && !errors.length) errors.push('Add at least one category, like "Backend: owner/repo".');
    formErrors = errors;
    if (errors.length) return;
    token = draftToken.trim();
    catText = draftCats.trim();
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(CATS_KEY, catText);
    editing = false;
  }
</script>

<svelte:window onhashchange={() => (view = viewFromHash())} />

<header class="bar">
  <strong class="brand">Pullboard</strong>
  <nav class="tabs">
    <a href="#/" class:on={view === 'board'} aria-current={view === 'board' ? 'page' : undefined}>Board</a>
    <a href="#/runs" class:on={view === 'runs'} aria-current={view === 'runs' ? 'page' : undefined}>Runs</a>
  </nav>
  <div class="right">
    {#if updated}<span>Updated {ago(updated, now)} ago</span>{/if}
    <button onclick={() => refresh()} disabled={!token || !repos.length}>↻ Refresh</button>
    <button onclick={openSettings}>Settings</button>
  </div>
</header>

{#if editing}
  <form class="settings" onsubmit={save}>
    <h2>Settings</h2>
    {#if !token}
      <p>Paste a GitHub token and list your repos to get started. Both are saved in this browser only.</p>
    {/if}
    <label for="token">GitHub token</label>
    <input id="token" type="password" bind:value={draftToken} autocomplete="off" spellcheck="false"
      placeholder="Output of gh auth token, or a classic token" />
    <p class="hint">Public repos need no scopes. Private repos need <code>repo</code>. The token is sent only to api.github.com.</p>
    <label for="categories">Categories</label>
    <textarea id="categories" rows="6" bind:value={draftCats} spellcheck="false"
      placeholder={'Backend: acme/api, acme/worker\nFrontend: acme/web, acme/docs'}></textarea>
    <p class="hint">One category per line: <code>Name: owner/repo, owner/repo</code></p>
    {#if formErrors.length}
      <div role="alert">{#each formErrors as msg}<p class="err">{msg}</p>{/each}</div>
    {/if}
    <div class="actions">
      <button class="primary">Save</button>
      {#if token && repos.length}<button type="button" onclick={() => (editing = false)}>Cancel</button>{/if}
    </div>
  </form>
{/if}

<main>
  {#if error}<p class="err banner" role="alert">{error}</p>{/if}
  {#if token && repos.length}
    <!-- Board stays mounted so collapsed rows survive a trip to Runs. -->
    <div hidden={view !== 'board'}><Board {categories} data={board} {now} /></div>
    {#if view === 'runs'}<Runs data={runs} {now} />{/if}
  {/if}
</main>

<style>
  .bar {
    position: sticky; top: 0; z-index: 1;
    display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
    padding: 10px 16px; background: var(--surface); border-bottom: 1px solid var(--line);
  }
  .brand { font-size: 16px; font-weight: 800; letter-spacing: -0.01em; }
  .tabs { display: flex; gap: 4px; }
  .tabs a { padding: 4px 10px; border-radius: 6px; color: var(--muted); font-weight: 500; }
  .tabs a:hover { text-decoration: none; color: var(--ink); }
  .tabs a.on { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
  .right { margin-left: auto; display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: 12.5px; }
  button {
    font: inherit; font-size: 12.5px; color: var(--ink); background: var(--surface);
    border: 1px solid var(--line); border-radius: 6px; padding: 4px 10px; cursor: pointer;
  }
  button:disabled { opacity: 0.5; cursor: default; }
  button.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); font-weight: 600; }

  .settings {
    display: grid; gap: 6px; max-width: 640px; margin: 20px auto 0; padding: 20px;
    background: var(--surface); border: 1px solid var(--line); border-radius: 10px;
  }
  .settings h2 { margin: 0 0 6px; font-size: 18px; }
  .settings p { margin: 0 0 6px; }
  .settings label { font-weight: 600; margin-top: 8px; }
  .settings input, .settings textarea {
    font: 13px/1.7 var(--mono); color: var(--ink); background: var(--ground);
    border: 1px solid var(--line); border-radius: 6px; padding: 7px 10px; width: 100%;
  }
  .settings textarea { resize: vertical; }
  .hint { color: var(--muted); font-size: 12.5px; }
  .settings [role='alert'] { display: grid; gap: 6px; }
  .actions { display: flex; gap: 8px; margin-top: 8px; }
  .actions button { font-size: 14px; padding: 6px 14px; }

  main { padding-block: 12px 40px; }
  .banner { margin: 0 16px 12px; }
</style>
