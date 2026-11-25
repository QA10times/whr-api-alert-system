# WHR API Alert System

Uptime checks and failure alerts for the `whr` platform (`gtm.whr.ai`, `geo.whr.ai`).

| Folder | What |
| --- | --- |
| `frontend/` | Next.js 14.2 dashboard (App Router). Spec: `docs/WHR-API-Monitor-Frontend-Design-NextJS.pdf` |
| `backend/` | NestJS API, sequential runner, alert emails, curl builder, Postgres |
| `mock-target/` | Scriptable HTTP server used by end-to-end tests |
| `docs/` | Design documents |

## Prerequisites

- Node 20 LTS (`nvm use` reads `.nvmrc`)
- Docker Desktop (Postgres and the full stack run in containers)

## Run everything

```sh
cp .env.example .env          # then fill in secrets
docker compose up --build     # dashboard on http://localhost:8080
```

For plain-HTTP local runs set `COOKIE_SECURE=false` in `.env`.

## Develop

```sh
docker compose up -d db       # Postgres only
cd backend  && npm install && npm run start:dev    # http://localhost:3000/api
cd frontend && npm install && npm run dev          # http://localhost:3001
```

`frontend/.env.local` needs `API_INTERNAL_URL=http://localhost:3000` and `COOKIE_SECURE=false`.
