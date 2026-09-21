const API = 'https://api.github.com';
const REPO = /^[\w.-]+\/[\w.-]+$/;
const CI = { SUCCESS: 'pass', FAILURE: 'fail', ERROR: 'fail', PENDING: 'run', EXPECTED: 'run' };

const unreadable = (repo) => `Can't read ${repo}. Check the spelling, or give your token access to this repo.`;

// "Backend: acme/api, acme/worker" per line -> [{ name, repos }], plus line errors.
export function parseCategories(text) {
  const categories = [];
  const errors = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const at = line.indexOf(':');
    const name = line.slice(0, at).trim();
    const repos = [...new Set(line.slice(at + 1).split(',').map((s) => s.trim()).filter(Boolean))];
    const bad = repos.find((r) => !REPO.test(r));
    if (at < 1 || !name || !repos.length) errors.push(`Line ${i + 1}: expected "Name: owner/repo, owner/repo".`);
    else if (bad) errors.push(`Line ${i + 1}: "${bad}" isn't in owner/repo form.`);
    else categories.push({ name, repos });
  });
  return { categories, errors };
}

export const uniqueRepos = (categories) => [...new Set(categories.flatMap((c) => c.repos))];

async function gh(token, path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    // no-cache: revalidate with ETag instead of serving GitHub's 60 s cached copy. 304s are free.
    cache: 'no-cache',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok) return body;
  const err = new Error(body.message ?? res.statusText);
  const reset = res.headers.get('x-ratelimit-reset');
  err.status = res.status;
  err.rate = res.status === 429 || res.headers.get('x-ratelimit-remaining') === '0';
  err.reset = reset ? new Date(reset * 1000) : null;
  throw err;
}

const PRS = `pullRequests(states: OPEN, first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) {
    totalCount
    nodes {
      number title url isDraft updatedAt
      author { login }
      commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
    }
  }
  closed: pullRequests(states: [CLOSED, MERGED], first: 10, orderBy: {field: UPDATED_AT, direction: DESC}) {
    nodes { number title url state closedAt author { login } }
  }`;

// One aliased field per repo (r0, r1, ...) so the whole board is one request.
// Names are already checked against REPO; JSON.stringify makes them GraphQL string literals.
export function boardQuery(repos) {
  const fields = repos.map((repo, i) => {
    const [owner, name] = repo.split('/');
    return `  r${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ${PRS} }`;
  });
  return `query {\n${fields.join('\n')}\n}`;
}

// -> { "owner/repo": { total, prs: [...], closed: [...] } | { error } }
export function mapBoard(repos, body) {
  if (!body.data) throw new Error(body.errors?.[0]?.message ?? 'GitHub returned no data.');
  return Object.fromEntries(
    repos.map((repo, i) => {
      const r = body.data[`r${i}`];
      if (!r) {
        const err = body.errors?.find((e) => e.path?.[0] === `r${i}`);
        return [repo, { error: !err || err.type === 'NOT_FOUND' ? unreadable(repo) : err.message }];
      }
      const prs = r.pullRequests.nodes.map((n) => ({
        number: n.number,
        title: n.title,
        url: n.url,
        draft: n.isDraft,
        updatedAt: n.updatedAt,
        author: n.author?.login ?? 'ghost',
        ci: CI[n.commits.nodes[0]?.commit.statusCheckRollup?.state] ?? 'none',
      }));
      // GitHub can't order PRs by close time, so take the 10 most recently active closed ones and keep the 5 closed last.
      const closed = r.closed.nodes
        .map((n) => ({
          number: n.number,
          title: n.title,
          url: n.url,
          merged: n.state === 'MERGED',
          closedAt: n.closedAt,
          author: n.author?.login ?? 'ghost',
        }))
        .sort((a, b) => b.closedAt.localeCompare(a.closedAt))
        .slice(0, 5);
      return [repo, { total: r.pullRequests.totalCount, prs, closed }];
    }),
  );
}

export async function fetchBoard(token, repos) {
  const body = await gh(token, '/graphql', { method: 'POST', body: JSON.stringify({ query: boardQuery(repos) }) });
  return mapBoard(repos, body);
}

// Running: oldest first, so rows keep their place as new runs arrive.
// Finished: newest 10, minus "skipped" runs, which comment-triggered workflows produce in bulk.
export function splitRuns(runs) {
  const running = runs.filter((w) => w.status !== 'completed').sort((a, b) => a.created_at.localeCompare(b.created_at));
  const finished = runs
    .filter((w) => w.status === 'completed' && w.conclusion !== 'skipped')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 10);
  return { running, finished };
}

export async function fetchRuns(token, repos) {
  // ponytail: newest 30 runs per repo; a run older than that is missed. Filter by status (2-3 calls/repo) if it bites.
  const results = await Promise.allSettled(repos.map((r) => gh(token, `/repos/${r}/actions/runs?per_page=30`)));
  const runs = [];
  const errors = [];
  results.forEach((res, i) => {
    if (res.status === 'fulfilled') runs.push(...res.value.workflow_runs);
    else if (res.reason.status === 401 || res.reason.rate) throw res.reason;
    else errors.push(res.reason.status === 404 ? unreadable(repos[i]) : `${repos[i]}: ${res.reason.message}`);
  });
  return { ...splitRuns(runs), errors };
}

// Calls fn now and again `ms` after each call settles. Pauses while the tab is hidden.
export function poll(fn, ms) {
  let timer;
  let stopped = false;
  async function tick() {
    clearTimeout(timer);
    if (stopped || document.hidden) return;
    await fn();
    clearTimeout(timer);
    if (!stopped && !document.hidden) timer = setTimeout(tick, ms);
  }
  const onVisible = () => !document.hidden && tick();
  document.addEventListener('visibilitychange', onVisible);
  tick();
  return {
    refresh: tick,
    stop() {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    },
  };
}

export function ago(time, now) {
  const s = Math.max(0, (now - new Date(time)) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function elapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
}
