# Redesign workspace

Work on the app redesign (simpler interaction, simpler onboarding, a more modern look) happens on the
`redesign` branch. Everything is tested locally first and merged into `main` only when ready —
**a push to `main` auto-deploys production on Railway**, so never push unfinished work there.

## Inputs

Research, mockups and other working materials are kept outside git, in the local `local/` folder
(excluded via `.git/info/exclude`). This repository is public: never commit them.

Redesign documents (Russian):

- [ux-audit.md](ux-audit.md) — UI/UX audit of the current app vs the mockups, decisions taken (§7), 3D graph plan (§8).
- [screens.md](screens.md) — screen-by-screen spec: elements, data sources (tRPC), states, done criteria.
- [dev-plan.md](dev-plan.md) — work packages WP1–WP9 for parallel agents: file ownership, dependencies, done criteria.
- [design-system.md](design-system.md) — tokens, type scale, sizes, components and patterns with rules; the live style
  guide is [mockups/v2/design-system.html](mockups/v2/design-system.html), canonical values in
  [mockups/v2/tokens.css](mockups/v2/tokens.css).
- [coverage.md](coverage.md) — every route, screen and feature of `main` mapped to its place in the redesign (kept, merged,
  removed with a reason) plus the open product questions.
- [mockups/](mockups/) — interactive prototype `app.html` (20 screens/states, the buttons under the phone switch them)
  and the landing concept `hui.html`. Open from any static server, e.g. `npx -y http-server docs/redesign/mockups -p 8787`,
  then `http://localhost:8787/app.html`. The flat graph in the prototype is a stand-in: the app keeps the 3D `NetworkGraph`.
- [mockups/v2/](mockups/v2/index.html) — the new screen designs (source of truth for the redesign): the style guide, Circle
  with its live states, Request, Collection, Add, Profile, People, onboarding, plus the public site (`site.html`), the
  "How it works" page (`hui.html`) and the desktop/tablet shell (`desktop.html`). Every page has a theme switch
  (bottom right); the explainer figures (network, hui table) live in `figures.js`. Same static server, `http://localhost:8787/v2/`.

**Native apps load the production web URL** (`apps/web/capacitor.config.ts`), so every web deploy from `main`
reaches iOS/Android users immediately, without a store release.

## Design tokens

Palette "Ink and teal". Semantic tokens are CSS variables in `apps/web/src/styles/tokens.css`
(light on `:root`, dark on `html.dark`) and Tailwind colors in `apps/web/tailwind.config.js`.

| Token | Use |
|-------|-----|
| `bg-canvas` | Page background |
| `bg-surface`, `bg-surface-2` | Cards; nested blocks and inputs |
| `text-ink`, `text-ink-muted`, `text-ink-subtle` | Text, people; secondary text; hints |
| `border-line`, `border-line-strong` | Hairlines; input borders |
| `bg-care` / `text-care` / `bg-care-soft` | Participation and the primary action |
| `text-link` / `bg-link-soft` | Connections and links |
| `bg-sos` / `bg-sos-soft` | SOS only |
| `bg-warm` / `bg-warm-soft` | Rare warm accent |

Rules for redesigned code: use semantic tokens only, no raw `gray-*` / `blue-*` and no `dark:` variants
(tokens switch themes by themselves). The old ramps (`gray`, `blue`, `teal`, `green`, `red`, `amber`, ...)
are temporarily mapped to the same palette so screens that are not redesigned yet still match.

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

### Testing on a phone

Two ways, from quick to stable:

1. **Dev server over Wi-Fi.** Vite listens on all interfaces (), so with the phone on the same
   network open  (find the IP with ; the Vite banner prints it as "Network"). The API is
   reached through the Vite proxy, which rewrites the browser's Origin to  for the CORS allowlist.
   Sign in with the e-mail code from ; Google/Apple/Telegram sign-in do not work on a LAN
   address. Plain http also means no PWA install and no camera (the QR scanner needs a secure context).
2. **Staging on Railway.** A second deployment of the  branch with its own database and a railway.app
   domain (https): the phone opens it in Chrome, installs it as a PWA from the browser menu, and the camera, web push and
   OAuth redirects (once the staging domain is added in the Google/Apple consoles) all work. Production keeps serving
    untouched. The native Android/iOS wrappers load production, so they are not part of this loop.

### Redis

Without `REDIS_URL` the API starts normally and skips the BullMQ workers (reminders, broadcasts,
scheduled cycle close, notification expiry); currency rates are fetched without cache.
Memurai's MSI failed to install on this machine and Microsoft Garnet lacks commands BullMQ needs,
so Redis is disabled for now. Set `REDIS_URL=redis://localhost:6379` once a Redis 6.2+ server runs locally.
