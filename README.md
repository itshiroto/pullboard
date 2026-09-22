# Pullboard
tl;dr: I'm working on three repos for my work, and i'm too lazy to open many PR tabs for each repos. Therefore, this exists :D

<img width="2925" height="2038" alt="Screenshot 2026-09-22 at 09 24 29" src="https://github.com/user-attachments/assets/0e281428-c8c6-406b-b0c8-1c2f2950efc0" />

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
