# Redesign workspace

The [archive](../archive/README.md) contains the working documents for the redesign.
This page keeps the prototype links and local device-testing notes.

## Inputs

Private research and other unpublished working material stay in the ignored local folder.

Redesign documents (Russian):

- [ux-audit.md](../archive/redesign/ux-audit.md) — UI/UX audit of the current app vs the mockups, decisions taken (§7), 3D graph plan (§8).
- [screens.md](../archive/redesign/screens.md) — screen-by-screen spec: elements, data sources (tRPC), states, done criteria.
- [master-plan.md](../archive/redesign/master-plan.md) — stages, dependency map, tracker table and the delegation workflow; one ready-to-paste
  brief per work package in [briefs/](../archive/redesign/briefs/).
- [dev-plan.md](../archive/redesign/dev-plan.md) — work packages WP1–WP10 for parallel agents: file ownership, dependencies, done criteria.
- [design-system.md](../archive/redesign/design-system.md) — tokens, type scale, sizes, components and patterns with rules; the live style
  guide is [mockups/v2/design-system.html](mockups/v2/design-system.html), canonical values in
  [mockups/v2/tokens.css](mockups/v2/tokens.css).
- [coverage.md](../archive/redesign/coverage.md) — every route, screen and feature of `main` mapped to its place in the redesign (kept, merged,
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

See the [deployment notes](../operations.md#redesign-migrations) for the production migration history.

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
stay in `apps/web/tailwind.config.js` because these screens still use them: support chat, FAQ, the
assistant, broadcast, the message composer, the native push prompt, the protected-route spinner, and
`components/ui/rich-text.tsx`. `docs/archive/redesign/design-system.md` still says to delete the ramps in WP9;
that note is out of date until those screens move to tokens.

## Local development on Windows

### Toolchain

| Tool | Version | Installed with |
|------|---------|----------------|
| Git | 2.56 | `winget install Git.Git` |
| Node.js | 22 (see `.node-version`) | `winget install OpenJS.NodeJS.22` |
| pnpm | 10.4.1 (see `packageManager`) | `npm i -g pnpm@10.4.1` |
| PostgreSQL | 17, host port **54329** | Root Compose file |
| Redis | Optional, host port **63799** | Root Compose file |

Follow the [root quick start](../../README.md#quick-start) for the environment
files, database setup, and dev servers. The examples run the web app on port
3060 and the API on port 3061.

### Test data

`pnpm db:setup` seeds fictional people into an empty local database. The
standalone `packages/db/prisma/seed-dev.ts` script resets user data when run
without arguments. Use the root quick start for a first run or to keep
existing users.

| Account | State |
|---------|-------|
| `anna@test.local` | Active member: 6 direct connections, 3-level network (18 people), own regular collection, a friend's emergency collection, notifications, an incoming acquaintance request |
| `new@test.local` | Brand-new member with an empty circle (onboarding) |
| `maria@test.local` | Author of an active emergency collection |

### Signing in locally

- **E-mail code:** the API example writes messages to `apps/api/so-dev-mail.log`
  (override with `DEV_MAIL_OUTBOX`) — read the code there.
- **Demo mode is removed.** There is no `demo-token` and no mock tRPC link. Sign in against the local API.
- Telegram / Google / Apple sign-in need the corresponding keys in the env files.

### Testing on a phone

**Dev server over Wi-Fi.** Vite listens on all interfaces (`server.host: true`), so with the phone on the same
   network open `http://<pc-ip>:3060` (find the IP with `ipconfig`; the Vite banner prints it as "Network"). The API is
   reached through the Vite proxy, which rewrites the browser's Origin to `localhost:3000` for the CORS allowlist.
   Sign in with the e-mail code from `apps/api/so-dev-mail.log`; Google/Apple/Telegram sign-in do not work on a LAN
   address. Plain http also means no PWA install and no camera (the QR scanner needs a secure context).

The former Railway redesign staging environment was deleted. For HTTPS-only device features,
use a separate test deployment with its own database and integration settings.

### Redis

Without `REDIS_URL` the API starts normally and skips the BullMQ workers (reminders, broadcasts,
scheduled cycle close, notification expiry); currency rates are fetched without cache.
Memurai's MSI failed to install on this machine and Microsoft Garnet lacks commands BullMQ needs,
so Redis is disabled for now. Set `REDIS_URL=redis://127.0.0.1:63799` to use Redis from the root Compose file.

## What the redesign changed

The signed-in app is four tabs: Circle (`/`), Ask (`/ask`), Add (`/add`), Profile (`/me`). Guests get the
public site at `/` and the explainer at `/how`. A person is `/person/:id`, a collection is `/collection/:id`.
Old URLs (`/dashboard`, `/network`, `/notifications`, `/create`, `/settings`, `/welcome`, `/arvut`,
`/matches`, `/skills`, `/needs`) redirect. The planet, globe, clouds, video guides, demo mode, and the
retired-feature page are gone. The 3D view that remains is `NetworkGraph` on the Circle, in its own chunk.

`telegram-web-app.js` is injected during HTML parse, before the app entry, only inside Telegram:
`tgWebAppData` or `tgWebApp` in the URL or hash, a Telegram user agent, `window.TelegramWebviewProxy`,
sessionStorage `__telegram__initParams`, or an iframe that has those stored params or a `tgWebApp` hash.
The extra checks cover a full-page reload inside Telegram Desktop, iOS, Android, and Web A/K, where the
launch hash is already gone. A normal browser does not wait on the script, and `@so/tg-adapter` still
sees `window.Telegram` before React boots inside a Mini App.

Locale files are owned by the translations work. Keys that this cleanup left unused (do not delete them here):
`videoGuide.*`, `retired.title`, `retired.text`, `retired.back`, `requiredInfo.*`, `milestones.*`,
and `network.controlsHint`. `circle.feed.milestoneFirst`, `circle.feed.milestoneTen`, `circle.feed.milestoneWith`,
and `circle.feed.milestoneGrow` are still used.
