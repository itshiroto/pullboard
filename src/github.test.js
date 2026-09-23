import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCategories, uniqueRepos, boardQuery, mapBoard, groupRuns } from './github.js';

test('parses category lines and reports bad ones by line number', () => {
  const text = 'Backend: acme/api, acme/worker, acme/api,\n\nFrontend:acme/web\nno colon\nOps: acme infra\nEmpty:';
  const { categories, errors } = parseCategories(text);
  assert.deepEqual(categories, [
    { name: 'Backend', repos: ['acme/api', 'acme/worker'] },
    { name: 'Frontend', repos: ['acme/web'] },
  ]);
  assert.deepEqual(errors.map((e) => e.split(':')[0]), ['Line 4', 'Line 5', 'Line 6']);
});

test('a repo in two categories is queried once', () => {
  const repos = uniqueRepos(parseCategories('A: acme/api, acme/web\nB: acme/api').categories);
  assert.deepEqual(repos, ['acme/api', 'acme/web']);
  const q = boardQuery(repos);
  assert.equal(q.match(/repository\(/g).length, 2);
  assert.match(q, /r1: repository\(owner: "acme", name: "web"\)/);
});

test('maps aliases back to repos, keeps per-repo errors, maps CI states, keeps the 5 closed last', () => {
  const pr = (number, state) => ({
    number, title: `PR ${number}`, url: 'https://github.com/acme/api/pull/1', isDraft: false, baseRefName: 'main', headRefName: `feat-${number}`,
    updatedAt: '2026-09-01T00:00:00Z', author: number ? { login: 'mira' } : null,
    commits: { nodes: [{ commit: { statusCheckRollup: state && { state } } }] },
  });
  const states = ['SUCCESS', 'FAILURE', 'ERROR', 'PENDING', 'EXPECTED', null];
  // Returned by last activity; day = close date.
  const closed = [3, 9, 1, 7, 5, 8].map((day, i) => ({
    number: day, title: `Closed ${day}`, url: 'u', state: i === 1 ? 'CLOSED' : 'MERGED',
    closedAt: `2026-09-0${day}T00:00:00Z`, author: { login: 'mira' }, baseRefName: 'main', headRefName: `fix-${day}`,
  }));
  const body = {
    data: { r0: null, r1: { pullRequests: { totalCount: 51, nodes: states.map((s, i) => pr(i, s)) }, closed: { nodes: closed } } },
    errors: [{ type: 'NOT_FOUND', path: ['r0'], message: 'Could not resolve to a Repository' }],
  };
  const out = mapBoard(['acme/legacy', 'acme/api'], body);
  assert.match(out['acme/legacy'].error, /Can't read acme\/legacy/);
  assert.equal(out['acme/api'].total, 51);
  assert.deepEqual(out['acme/api'].prs.map((p) => p.ci), ['pass', 'fail', 'fail', 'run', 'run', 'none']);
  assert.equal(out['acme/api'].prs[0].author, 'ghost');
  assert.deepEqual(out['acme/api'].closed.map((p) => p.number), [9, 8, 7, 5, 3]);
  assert.deepEqual(out['acme/api'].closed.map((p) => p.merged), [false, true, true, true, true]);
  assert.deepEqual([out['acme/api'].prs[1].base, out['acme/api'].prs[1].head], ['main', 'feat-1']);
  assert.equal(out['acme/api'].closed[0].head, 'fix-9');
  assert.throws(() => mapBoard(['acme/api'], { errors: [{ message: 'API rate limit exceeded' }] }), /rate limit/);
});

test('groups runs by repo: running (oldest first) then newest finished, 10 per repo, no skipped', () => {
  const at = (m) => `2026-09-01T10:${String(m).padStart(2, '0')}:00Z`;
  const r = (full_name) => ({ repository: { full_name } });
  const runs = [
    { id: 'q', status: 'queued', created_at: at(50), updated_at: at(50), ...r('acme/web') },
    { id: 'p', status: 'in_progress', created_at: at(40), updated_at: at(45), ...r('acme/web') },
    { id: 's', status: 'completed', conclusion: 'skipped', created_at: at(55), updated_at: at(55), ...r('acme/web') },
    ...Array.from({ length: 12 }, (_, i) => ({ id: i, status: 'completed', created_at: at(i), updated_at: at(i + 1), ...r('acme/web') })),
    { id: 'api', status: 'completed', conclusion: 'success', created_at: at(5), updated_at: at(6), ...r('acme/api') },
  ];
  const groups = groupRuns(runs);
  assert.deepEqual(groups.map((g) => g.repo), ['acme/api', 'acme/web']);
  assert.deepEqual(groups[0].runs.map((w) => w.id), ['api']);
  assert.deepEqual(groups[1].runs.map((w) => w.id), ['p', 'q', 11, 10, 9, 8, 7, 6, 5, 4]);
});
