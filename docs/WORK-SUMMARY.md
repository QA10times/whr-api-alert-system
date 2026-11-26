# Work summary — WHR API Alert System

Status as of 26 Nov 2026. What was built after the dashboard and mock target, how to run and test it, the decisions taken where the designs were silent, and what is still open.

The work is split into two pull requests:

| Branch | Contains |
| --- | --- |
| `backend` | NestJS backend, database schema, runner and alerts, Docker and env files, root README, this summary |
| `frontend` | Frontend types aligned with the backend, two UI bug fixes, Playwright end-to-end tests E1–E17 |

Either can be merged first. Running the e2e tests needs both, because the test stack starts the backend through `npm run e2e:api`.

## 1. Backend (`backend/`)

Built from *WHR API Alert System — Backend Design (HLD, LLD, Schema)*. NestJS 10, TypeORM, PostgreSQL 16, Node 20.

| Area | What it does |
| --- | --- |
| Config | `.env` checked at boot (Joi) with the design's variable names; boot fails on a missing or malformed value |
| Schema | The design's DDL verbatim: 4 enums, 10 tables, 13 named indexes. Migrations and the seed (platform `whr` with `gtm` as default and `geo`) run before the server starts |
| Auth | `POST /api/auth/login` checks `AUTH_USERS` (plain or bcrypt), returns a JWT; 5 attempts a minute per IP. Every other route needs the JWT except `/api/health` |
| Config API | Platforms, modules, APIs and email groups with the design's validation rules; field-level 400s keyed to the form inputs; case-insensitive 409s on duplicate names |
| Credentials | AES-256-GCM at rest, never in normal responses. Edit rules: an omitted field keeps the saved value, an empty string clears it. Show credentials and Copy curl share one per-user rate limit and write an audit row without the secret |
| Copy curl | Built by the same `RequestBuilder` the runner uses, so the copied command is exactly what is sent |
| Runner | Every 15 s, under a Postgres advisory lock, checks due APIs strictly one at a time; Run now and Run a check cycle join the same queue; progress at `GET /api/runner/status` |
| Pass rule | HTTP 200, then count key > 0, then data key holds more than 1 object; the first failed check is the failure reason. Timeouts, network errors and redirects are failures |
| Alerts | The 5th failure in a row stores and emails one alert (status, time in IST and UTC, tag, last 5 results, dashboard link); the first pass after it sends a recovery email. Failed sends retry every 2 minutes, up to 3 attempts. A module with no group stores the alert as "no recipients" |
| Housekeeping | Run history older than 30 days is deleted nightly in batches |

Choices made where the design is silent:
- Response shapes the design does not spell out (module list, API detail, run history, email groups) follow the shapes the dashboard already expected, so the frontend needed few changes.
- Changing a module's frequency makes its inheriting APIs due at once, as the design specifies for an API's own frequency.
- Running a paused API returns 409.
- Network errors are reported as "Network error, no response", separate from timeouts.
- Without `SMTP_HOST`, alert emails are written to the log instead of sent. This is for local development only.

## 2. Frontend changes (`frontend/`)

- `lib/types.ts` now matches the backend responses; the placeholder TODO is gone.
- Adding emails to a group reports what the server actually added and which already existed.
- The alert email preview shows why an alert was not delivered (for example "no recipients").
- **Bug fixed:** after sign-in the dashboard stayed on `/` instead of `/?env=gtm`.
- **Bug fixed:** closing Edit API or Edit module with Escape lost keyboard focus instead of returning it to the button that opened the dialog.

## 3. Tests

| Suite | Count | Command |
| --- | --- | --- |
| Backend unit + integration (real PostgreSQL) | 117 | `cd backend && npm test` |
| Frontend unit (Vitest) | 24 | `cd frontend && npm test` |
| End-to-end (Playwright, E1–E17 of the frontend design) | 16 tests (E9 and E10 run as one) | `cd frontend && npm run build && npm run e2e` |

Backend integration tests run the real runner against an HTTP stub. They check that only one call is ever in flight, that 5 failures send exactly one email followed by a recovery email, that the advisory lock blocks a second runner, and that the retry limit holds.

## 4. Running it

Docker cannot run on the development machine yet: virtualization is off in its BIOS. To work without Docker, the backend uses `embedded-postgres`, a real PostgreSQL 16 started from npm:

```sh
cd backend && cp .env.example .env   # set JWT_SECRET, ENCRYPTION_KEY, AUTH_USERS
npm install && npm run db:dev        # PostgreSQL on :5432; migrates and seeds
npm run start:dev                    # API on http://localhost:3000/api
cd frontend && npm run dev           # dashboard on http://localhost:3001
```

With Docker: `cp .env.example .env`, fill in the secrets, then `docker compose up --build`. The dashboard is on http://localhost:8080.

## 5. Still open

| Item | Owner |
| --- | --- |
| Run `docker compose up --build` and check every flow at :8080. Only `docker compose config` has been verified; no image has been built yet | Dev, once virtualization is enabled on the machine |
| **Security:** the backend cannot see the real client IP. Without a reverse proxy, every request comes from the Next.js server, so the 5-per-minute login limit is shared by all users. A client can also fake `X-Forwarded-For` to dodge the limit or forge audit IPs. Fix with a trusted reverse proxy that sets the header, and/or a per-email login limit | Decision needed |
| Which SMTP account sends alerts (design open question) | Decision needed |
| Should a still-failing API send reminder emails? Is "5 hits" 5 in a row (built) or 5 within a time window? (design open questions) | Decision needed |
| Add the backend design PDF to `docs/` | Owner of the design doc |
