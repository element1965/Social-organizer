# Redesign workspace

Work on the app redesign (simpler interaction, simpler onboarding, a more modern look) happens on the
`redesign` branch. Everything is tested locally first and merged into `main` only when ready —
**a push to `main` auto-deploys production on Railway**, so never push unfinished work there.

## Inputs

Research, mockups and other working materials are kept outside git, in the local `local/` folder
(excluded via `.git/info/exclude`). This repository is public: never commit them.

**Native apps load the production web URL** (`apps/web/capacitor.config.ts`), so every web deploy from `main`
reaches iOS/Android users immediately, without a store release.

## Local development on Windows

### Toolchain

| Tool | Version | Installed with |
|------|---------|----------------|
| Git | 2.56 | `winget install Git.Git` |
| Node.js | 22 (see `.node-version`) | `winget install OpenJS.NodeJS.22` |
| pnpm | 10.4.1 (see `packageManager`) | `npm i -g pnpm@10.4.1` |
| PostgreSQL | 17, port **5434**, user `postgres` / password `1111` | `winget install PostgreSQL.PostgreSQL.17` with `--serverport 5434` |
| Redis | not set up yet (optional, see below) | — |

### Env files (not committed)

- `packages/db/.env` — `DATABASE_URL` for Prisma.
- `apps/api/.env` — loaded by `pnpm dev` (`tsx watch --env-file-if-exists=.env`). Needs `DATABASE_URL`,
  `JWT_SECRET` (16+ chars), `WEB_APP_URL=http://localhost:3000`; integration keys are optional.
- `apps/web/.env` — `VITE_*` build-time variables.

### First run

```bash
pnpm install
pnpm db:generate
cd packages/db && npx prisma db push && cd ../..
pnpm build
pnpm dev
```

- Web: http://localhost:3000 (Vite proxies `/trpc`, `/api`, `/gun` to the API).
- API: http://localhost:3001, healthcheck `/health`.

**Why `db push` and not `migrate deploy`:** migration `20260207165421_add_faq_items` inserts FAQ rows that
reference a production user id, so the migration chain fails on an empty database. `db push` creates the
current schema without that data. Use `migrate deploy` only against databases that already have the history.

### Test data

`packages/db/prisma/seed-dev.ts` wipes the **local** database and fills it with fictional people
(it refuses to run unless `DATABASE_URL` points to localhost):

```bash
cd packages/db
../../apps/api/node_modules/.bin/tsx prisma/seed-dev.ts
```

| Account | State |
|---------|-------|
| `anna@test.local` | Active member: 6 direct connections, 3-level network (18 people), own regular collection, a friend's emergency collection, notifications, an incoming acquaintance request |
| `new@test.local` | Brand-new member with an empty circle (onboarding) |
| `maria@test.local` | Author of an active emergency collection |

### Signing in locally

- **E-mail code:** without `RESEND_API_KEY`, the dev API writes messages to `%TEMP%\so-dev-mail.log`
  (override with `DEV_MAIL_OUTBOX`) — read the code there.
- **Demo mode is effectively off:** `ProtectedRoute.tsx` and `LoginPage.tsx` clear the `demo-token`, nothing sets it,
  and `lib/demoData.ts` misses ~48 of 102 procedures (all `pending.*`, `milestone.*`, ...). Use the real local API.
- Telegram / Google / Apple sign-in need the corresponding keys in the env files.

### Redis

Without `REDIS_URL` the API starts normally and skips the BullMQ workers (reminders, broadcasts,
scheduled cycle close, notification expiry); currency rates are fetched without cache.
Memurai's MSI failed to install on this machine and Microsoft Garnet lacks commands BullMQ needs,
so Redis is disabled for now. Set `REDIS_URL=redis://localhost:6379` once a Redis 6.2+ server runs locally.
