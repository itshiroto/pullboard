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

const closedField = (after) => `pullRequests(states: [CLOSED, MERGED], first: 10${after ? `, after: ${JSON.stringify(after)}` : ''}, orderBy: {field: UPDATED_AT, direction: DESC}) {
    pageInfo { hasNextPage endCursor }
    nodes { number title url state closedAt baseRefName headRefName author { login } }
  }`;

const PR_FIELDS = `number title url isDraft updatedAt baseRefName headRefName
      author { login }
      commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }`;

const mapPr = (n) => ({
  number: n.number,
  title: n.title,
  url: n.url,
  draft: n.isDraft,
  updatedAt: n.updatedAt,
  author: n.author?.login ?? 'ghost',
  base: n.baseRefName,
  head: n.headRefName,
  ci: CI[n.commits.nodes[0]?.commit.statusCheckRollup?.state] ?? 'none',
});

const PRS = `pullRequests(states: OPEN, first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) {
    totalCount
    nodes { ${PR_FIELDS} }
  }
  closed: ${closedField()}`;

// GitHub can't order PRs by close time, so each page is the 10 most recently active closed ones, sorted by close time.
// ponytail: order is exact within a page, not across pages; a PR closed long after its last activity can sit a page late.
function mapClosed(conn) {
  const prs = conn.nodes
    .map((n) => ({
      number: n.number,
      title: n.title,
      url: n.url,
      merged: n.state === 'MERGED',
      closedAt: n.closedAt,
      author: n.author?.login ?? 'ghost',
      base: n.baseRefName,
      head: n.headRefName,
    }))
    .sort((a, b) => b.closedAt.localeCompare(a.closedAt));
  return { prs, cursor: conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null };
}

// One aliased field per repo (r0, r1, ...) so the whole board is one request.
// Names are already checked against REPO; JSON.stringify makes them GraphQL string literals.
export function boardQuery(repos) {
  const fields = repos.map((repo, i) => {
    const [owner, name] = repo.split('/');
    return `  r${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ${PRS} }`;
  });
  return `query {\n${fields.join('\n')}\n}`;
}

// -> { "owner/repo": { total, prs: [...], closed: [...], closedCursor } | { error } }
export function mapBoard(repos, body) {
  if (!body.data) throw new Error(body.errors?.[0]?.message ?? 'GitHub returned no data.');
  return Object.fromEntries(
    repos.map((repo, i) => {
      const r = body.data[`r${i}`];
      if (!r) {
        const err = body.errors?.find((e) => e.path?.[0] === `r${i}`);
        return [repo, { error: !err || err.type === 'NOT_FOUND' ? unreadable(repo) : err.message }];
      }
      const prs = r.pullRequests.nodes.map(mapPr);
      const { prs: closed, cursor: closedCursor } = mapClosed(r.closed);
      return [repo, { total: r.pullRequests.totalCount, prs, closed, closedCursor }];
    }),
  );
}

export async function fetchBoard(token, repos) {
  const body = await gh(token, '/graphql', { method: 'POST', body: JSON.stringify({ query: boardQuery(repos) }) });
  return mapBoard(repos, body);
}

// Next page of a repo's closed PRs -> { prs, cursor }; cursor is null on the last page.
export async function fetchClosed(token, repo, after) {
  const [owner, name] = repo.split('/');
  const query = `query { repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ${closedField(after)} } }`;
  const body = await gh(token, '/graphql', { method: 'POST', body: JSON.stringify({ query }) });
  if (!body.data?.repository) throw new Error(body.errors?.[0]?.message ?? 'GitHub returned no data.');
  return mapClosed(body.data.repository.pullRequests);
}

// GitHub caps a search query at 256 characters, so repos are split across as many
// aliased searches as needed, all in one request. The text can hold qualifiers too (author:mira).
export function searchQuery(repos, text) {
  const base = `is:pr ${text.trim()}`;
  const chunks = [];
  for (const r of repos) {
    const last = chunks.at(-1);
    if (last && `${last} repo:${r}`.length <= 256) chunks[chunks.length - 1] = `${last} repo:${r}`;
    else chunks.push(`${base} repo:${r}`);
  }
  if (chunks.some((c) => c.length > 256)) throw new Error('Search text is too long.');
  const fields = chunks.map(
    (q, i) => `  s${i}: search(query: ${JSON.stringify(q)}, type: ISSUE, first: 50) {
    issueCount
    nodes { ... on PullRequest { ${PR_FIELDS} state closedAt repository { nameWithOwner } } }
  }`,
  );
  return `query {\n${fields.join('\n')}\n}`;
}

// -> { total, prs: [...] } newest activity first. state is open, merged or closed.
// ponytail: 50 results per chunk of repos; the rest are counted in total but not shown. Page with cursors if that bites.
export function mapSearch(body) {
  if (!body.data) throw new Error(body.errors?.[0]?.message ?? 'GitHub returned no data.');
  const results = Object.values(body.data);
  return {
    total: results.reduce((n, r) => n + r.issueCount, 0),
    prs: results
      .flatMap((r) => r.nodes)
      .map((n) => ({ ...mapPr(n), repo: n.repository.nameWithOwner, state: n.state.toLowerCase(), closedAt: n.closedAt }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  };
}

export async function searchPrs(token, repos, text) {
  const body = await gh(token, '/graphql', { method: 'POST', body: JSON.stringify({ query: searchQuery(repos, text) }) });
  return mapSearch(body);
}

// One group per repo: running first (oldest first, so rows keep their place), then the
// newest finished, capped at 10 rows. "skipped" runs are dropped — comment-triggered
// workflows produce them in bulk.
export function groupRuns(runs) {
  const byRepo = new Map();
  for (const w of runs) {
    const repo = w.repository.full_name;
    if (!byRepo.has(repo)) byRepo.set(repo, []);
    byRepo.get(repo).push(w);
  }
  return [...byRepo]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([repo, all]) => ({
      repo,
      runs: [
        ...all.filter((w) => w.status !== 'completed').sort((a, b) => a.created_at.localeCompare(b.created_at)),
        ...all
          .filter((w) => w.status === 'completed' && w.conclusion !== 'skipped')
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
      ].slice(0, 10),
    }));
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
  return { groups: groupRuns(runs), errors };
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
