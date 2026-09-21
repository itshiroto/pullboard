# Pullboard

Watches open PRs (with CI status) and GitHub Actions runs across repos you group into categories.
Board: one row per category, one column per repo, one card per open PR. Runs: queued and in-progress runs, plus the last 10 finished.

It runs entirely in the browser. Your token is kept in that browser's localStorage and is sent only to api.github.com.

## Develop

```sh
pnpm install
pnpm dev      # http://localhost:5173
pnpm test
pnpm build    # static site in dist/
```

## Docker

```sh
docker compose -f docker-compose.example.yml up -d --build   # http://localhost:8080
```

## Settings

- **Token:** the output of `gh auth token`, or a classic token. Public repos need no scopes. Private repos need `repo`.
- **Categories:** one per line. Rows and columns follow the order you write them in.

  ```
  Backend: acme/api, acme/worker
  Frontend: acme/web, acme/docs
  ```
