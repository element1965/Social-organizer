# Social Organizer

A coordination app for mutual support through trusted networks. Facebook Instant Game + Telegram WebApp.

## Architecture

Turborepo monorepo with pnpm workspaces.

```
Social organizer/
├── apps/
│   ├── api/             # @so/api: Fastify + tRPC + BullMQ
│   ├── web/             # @so/web: React 19 + Vite + Tailwind + shadcn/ui
│   └── mobile/          # @so/mobile: React Native Expo (stub)
├── packages/
│   ├── shared/          # @so/shared: types, constants, currencies, validation
│   ├── db/              # @so/db: Prisma schema + migrations (PostgreSQL 17)
│   ├── api-client/      # @so/api-client: tRPC client
│   ├── i18n/            # @so/i18n: i18next (en + ru + 23 more)
│   ├── gun-backup/      # @so/gun-backup: Gun.js local backup (stub)
│   ├── graph-3d/        # @so/graph-3d: Three.js visualization (PlanetScene, GlobeNetwork, NetworkGraph)
│   ├── fb-adapter/      # @so/fb-adapter: FB Instant Game SDK (stub)
│   └── tg-adapter/      # @so/tg-adapter: Telegram WebApp (stub)
├── turbo.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── PLAN.md              # Development plan by phases
└── SPEC.md              # Full project specification
```

## Tech Stack

- **Monorepo:** Turborepo + pnpm
- **Backend:** Fastify + tRPC + Prisma + PostgreSQL 17 + BullMQ + Redis
- **Frontend:** React 19 + Vite + Tailwind CSS + shadcn/ui
- **Mobile:** React Native (Expo) + NativeWind
- **3D:** Three.js + react-force-graph-3d
- **Backup:** Gun.js (IndexedDB)
- **i18n:** i18next (25 languages: en, ru, es, fr, de, pt, it, zh, ja, ko, ar, hi, tr, pl, uk, nl, sv, da, fi, no, cs, ro, th, vi, id)

## Quick Start

```bash
# Install dependencies
pnpm install

# Configure database
cp packages/db/.env.example packages/db/.env
# Edit packages/db/.env if needed

# Run migrations
pnpm db:migrate

# Build all packages
pnpm build

# Start dev servers
pnpm dev
```

## Database

- **PostgreSQL 17** on port 5434
- Prisma ORM for migrations and client generation

### Data Models

| Model | Description |
|-------|-------------|
| User | User with settings, role, and onboarding flag |
| UserContact | User contacts (social networks, messengers) |
| PlatformAccount | Platform bindings (FB/TG/Apple/Google) |
| Connection | Connection between users (userAId < userBId) |
| Collection | Fundraising (emergency/regular) |
| Obligation | Intention for a collection |
| Notification | Notification with handshake path |
| IgnoreEntry | Ignore record |
| LinkingCode | 6-digit linking code (5 min TTL) |
| InviteLink | Invitation link |

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all packages |
| `pnpm dev` | Start dev servers |
| `pnpm typecheck` | Type check |
| `pnpm db:migrate` | Run Prisma migrations |
| `pnpm db:generate` | Generate Prisma Client |
| `pnpm db:studio` | Open Prisma Studio |

## Environment Variables

### packages/db/.env
```
DATABASE_URL="postgresql://postgres:1111@localhost:5434/social_organizer?schema=public"
```

### apps/api
```
PORT=3001
DATABASE_URL=postgresql://postgres:1111@localhost:5434/social_organizer?schema=public
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
```

## API (tRPC Endpoints)

| Router | Procedures |
|--------|------------|
| `auth` | loginWithPlatform, refresh, generateLinkCode, linkAccount |
| `user` | me, update, getById, getStats, getContacts, updateContacts, completeOnboarding, delete |
| `connection` | list, add (limit 150), getCount, graphSlice (2-3 levels), findPath, getNetworkStats |
| `collection` | create, getById, close, cancel, myActive, myParticipating |
| `obligation` | create, myList, unsubscribe |
| `notification` | list (cursor pagination), markRead, dismiss, unreadCount |
| `settings` | get, updateLanguage/Theme/Sound/FontScale, ignoreList/addIgnore/removeIgnore |
| `invite` | generate, accept, getByToken |
| `stats` | profile |

## Services

- **Auth** — JWT (HS256), 30 min access / 30 days refresh, 6-digit linking codes
- **BFS** — Recursive CTE in PostgreSQL for graph traversal, path finding, and notification distribution
- **Notifications** — BFS distribution with ignore list and handshake path

## BullMQ Workers

| Worker | Description | Schedule |
|--------|-------------|----------|
| `re-notify` | Re-notifications for active collections | Every 12h |
| `cycle-close` | Auto-close 28-day cycle for regular collections | Every hour |
| `special-notify` | Notifications for Author/Developer collections (after first intention) | Every hour |
| `expire-notifications` | Expired notifications (24h) → EXPIRED | Every hour |
| `check-block` | Check intention sum → BLOCKED | On event |

## Deployment

- **Railway:** Auto-deploy on `git push` to main
- **URL:** https://social-organizer-production.up.railway.app
- **Healthcheck:** /health
- **Services:** PostgreSQL 17, Redis 7, Fastify API
- **GitHub:** https://github.com/element1965/Social-organizer

## Web Frontend (apps/web)

React 19 SPA with tRPC client.

### Pages

| Page | Path | Description |
|------|------|-------------|
| LandingPage | `/welcome` | Public landing with 3D globe and project description |
| LoginPage | `/login` | Login via platform (FB/TG/Apple/Google) |
| OnboardingPage | `/onboarding` | 4-screen onboarding with invitation (auto for new users) |
| DashboardPage | `/` | My collections, intentions, network, "I need support" (protected → /welcome) |
| NotificationsPage | `/notifications` | Notifications with handshake path and 24h timer |
| CreateCollectionPage | `/create` | Create collection with network reach display (USD/EUR) |
| CollectionPage | `/collection/:id` | Collection details + intentions + handshake path to creator |
| MyNetworkPage | `/network` | Connection list + invitations |
| ProfilePage | `/profile/:userId` | Profile with editing, contacts, connections, handshake path |
| SettingsPage | `/settings` | Language, theme, sounds, font scale, contacts, ignore list |
| InvitePage | `/invite/:token` | Accept invitation link |

### Frontend Technologies

- **State:** Zustand (auth, theme) + tRPC React Query (server data)
- **Routing:** React Router v7 with ProtectedRoute (onboarding check)
- **UI:** shadcn-style components + Tailwind CSS 3 + Radix UI Tooltip
- **i18n:** i18next v25 + react-i18next (25 languages), auto-detect via navigator.language
- **Icons:** lucide-react + custom SVGs for social networks
- **QR:** qrcode.react
- **3D:** Three.js + @react-three/fiber (lazy loaded)
- **3D Graph:** react-force-graph-3d (lazy loaded)
- **Backup:** @so/gun-backup (Gun.js + IndexedDB)

### Bundle Size (code splitting)

| Chunk | Size | Gzip | Load |
|-------|------|------|------|
| index (main app + demo data) | 689 KB | 199 KB | Always |
| three (Three.js core) | 1284 KB | 342 KB | Lazy |
| r3f (React Three Fiber) | 169 KB | 54 KB | Lazy |
| force-graph (ForceGraph3D) | 206 KB | 63 KB | Lazy |
| CSS | 27 KB | 5 KB | Always |
| **Total gzip** | | **~663 KB** | **< 5 MB FB limit** |

## Demo Mode

On the `/login` page, there's a "Demo login without registration" button. When clicked, `accessToken: 'demo-token'` is saved to localStorage, and the tRPC client switches to a custom link returning mock data without HTTP requests to the backend.

Mock data (`apps/web/src/lib/demoData.ts`):
- **200 users** — programmatically generated from 20 first names x 10 last names
- **12 direct connections** — displayed in Dashboard and MyNetwork
- **3D graph** — ~60 nodes + ~80 edges (3 depth levels)
- **2 active collections** — EMERGENCY 500 USD (collected 280) and REGULAR 1000 EUR (collected 350)
- **3 intentions** — to others' collections (50 USD, 100 EUR, 25 USD)
- **5 notifications** — various types, 3 unread
- **Stats, settings, contacts, invitations** — all procedures covered

## Terminology (Glossary)

| Term | Description |
|------|-------------|
| **Handshake** | Mutual confirmation of an existing meaningful connection between two people |
| **Intention** | Voluntary decision to help. No pressure — everyone decides for themselves whether to participate |
| **Signal for support** | Creating a collection when support is needed. The network is notified through handshake chains |
| **Handshake chain** | Path of connections between two users through mutual acquaintances |

## Current Status

- [x] **Phase 0:** Monorepo infrastructure
- [x] **Phase 1:** Backend (API) — tRPC routers, services, BullMQ workers
- [x] **Phase 2:** Web frontend (MVP) — all 11 pages, UI components, tRPC client, i18n
- [x] **Phase 3:** 3D and optimization — Three.js planet, clouds, graph, Gun.js backup, code splitting
- [x] **Phase 4:** Deploy and testing — Railway config, API serves web frontend, SPEC audit fixes
- [x] **Phase 5:** UX improvements — onboarding, handshake chain, contacts, tooltips, terminology
