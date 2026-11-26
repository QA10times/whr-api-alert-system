# WHR API Alert System

Uptime checks and failure alerts for the `whr` platform (`gtm.whr.ai`, `geo.whr.ai`).

| Folder | What |
| --- | --- |
| `frontend/` | Next.js 14.2 dashboard (App Router). Spec: `docs/WHR-API-Monitor-Frontend-Design-NextJS.pdf` |
| `backend/` | NestJS 10 API, sequential runner, alert emails, curl builder, PostgreSQL 16. Spec: the backend design (HLD, LLD, Schema) |
| `mock-target/` | Scriptable HTTP server used by end-to-end tests |
| `docs/` | Design documents |

## Prerequisites

- Node 20 LTS (`nvm use` reads `.nvmrc`)
- Docker Desktop for the full stack. Without Docker, the backend runs against a real PostgreSQL 16 started by `embedded-postgres` (see below).

## Run everything (Docker)

```sh
cp .env.example .env          # then fill in secrets (ENCRYPTION_KEY: openssl rand -base64 32)
docker compose up --build     # dashboard on http://localhost:8080
```

For plain-HTTP local runs set `COOKIE_SECURE=false` in `.env`. The api container applies migrations and seeds `whr` (gtm, geo) on every start.

## Develop without Docker

```sh
cd backend
cp .env.example .env          # set JWT_SECRET, ENCRYPTION_KEY, AUTH_USERS
npm install
npm run db:dev                # PostgreSQL 16 on localhost:5432, data in backend/.pgdata; migrates + seeds
npm run start:dev             # in another shell: http://localhost:3000/api

cd frontend
npm install && npm run dev    # http://localhost:3001
```

`frontend/.env.local` needs `API_INTERNAL_URL=http://localhost:3000` and `COOKIE_SECURE=false`.

## Tests

```sh
cd backend && npm test        # unit tests + integration tests on a throwaway embedded PostgreSQL (port 5433)
cd frontend && npm test       # Vitest unit tests
```
