# Social Organizer

A coordination app for mutual support through trusted networks. Works as a regular website and as a Telegram Mini App (single build, runtime detection).

## Live Demo

- **Production:** https://social-organizer-production.up.railway.app
- **Demo login:** Click "Demo login without registration" on the login page

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
│   ├── graph-3d/        # @so/graph-3d: Three.js visualization (Earth, Moon, Stars, Network)
│   ├── fb-adapter/      # @so/fb-adapter: FB Instant Game SDK (stub)
│   └── tg-adapter/      # @so/tg-adapter: Telegram WebApp SDK adapter
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
- **3D:** Three.js + @react-three/fiber + NASA textures
- **Backup:** Gun.js (IndexedDB)
- **i18n:** i18next (28 languages: en, ru, es, fr, de, pt, it, zh, ja, ko, ar, hi, tr, pl, uk, nl, sv, da, fi, no, cs, ro, th, vi, id, sr, be, he)

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
| User | User with settings, role, onboarding flag, preferredCurrency, monthlyBudget, remainingBudget, lastSeen, hideContacts, skillsCompleted |
| UserContact | User contacts (social networks, messengers) |
| PlatformAccount | Platform bindings (FB/TG/Apple/Google) |
| Connection | Connection between users (userAId < userBId) with optional nicknames (nicknameByA, nicknameByB) |
| Collection | Fundraising (emergency/regular) with USD amount and original currency info |
| Obligation | Intention for a collection with USD amount and original currency info |
| Notification | Notification with handshake path |
| IgnoreEntry | Ignore record |
| LinkingCode | 6-digit linking code (5 min TTL) |
| InviteLink | Invitation link |
| ChatMessage | Chat conversation log (user message, assistant response, feedback flag, language) |
| PushSubscription | Web Push subscription (endpoint, keys, user FK) |
| FaqItem | FAQ entry with question, answer, language, sort order, view count, group ID for translations, localization flag (admin-managed with LLM auto-translation) |
| ScheduledPost | Scheduled broadcast post with status (PENDING/SENT/CANCELLED/FAILED), media, button |
| ScheduledPostDelivery | Individual delivery tracking per user per scheduled post with readAt for open stats |
| AutoChainMessage | Drip campaign message: text/media/button, dayOffset from registration, sortOrder, intervalMin |
| AutoChainDelivery | Delivery tracking per user per chain message with readAt for open stats |
| SkillCategory | Skill/need category with key, group, sortOrder, isOnline (221 categories in 15 groups) |
| UserSkill | User's offered skill (link to SkillCategory) with optional note |
| UserNeed | User's need (link to SkillCategory) with optional note |

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
TELEGRAM_BOT_TOKEN=your-bot-token    # Required for Telegram Mini App auth
FEEDBACK_CHAT_ID=-100xxxxxxxxxx      # Telegram group chat ID for user feedback
VAPID_PUBLIC_KEY=your-vapid-public-key    # Web Push VAPID public key
VAPID_PRIVATE_KEY=your-vapid-private-key  # Web Push VAPID private key
VAPID_SUBJECT=mailto:admin@example.com    # Web Push VAPID subject
```

## API (tRPC Endpoints)

| Router | Procedures |
|--------|------------|
| `auth` | loginWithPlatform, loginWithTelegram, refresh, generateLinkCode, linkAccount |
| `user` | me, update, getById, getStats, getContacts, updateContacts, completeOnboarding, delete, setMonthlyBudget |
| `connection` | list, listForUser, add (limit 150), getCount, graphSlice (2-3 levels), findPath, getNetworkStats, getNickname, setNickname |
| `collection` | create, getById, close, cancel, myActive, myParticipating |
| `obligation` | create, myList, unsubscribe |
| `notification` | list (cursor pagination), markRead, dismiss, unreadCount |
| `settings` | get, updateLanguage/Theme/Sound/FontScale/HideContacts, ignoreList/addIgnore/removeIgnore |
| `invite` | generate, accept, getByToken |
| `stats` | profile (obligationsGiven + obligationsReceived), help, networkCapabilities |
| `currency` | list, detectCurrency, rates, convert, toUSD |
| `push` | vapidPublicKey, subscribe, unsubscribe |
| `faq` | list, top, all, incrementView, localize, isAdmin, create, update, delete (admin-gated CRUD with view ranking and LLM auto-translation to 26 languages) |
| `broadcast` | sendAll, sendDirect, schedulePost, listScheduled, cancelScheduled, scheduledStats, createChainMessage, listChainMessages, updateChainMessage, deleteChainMessage, chainStats, markRead (admin-only Telegram broadcast with scheduled posts, auto-chain drip campaigns, and open tracking) |
| `skills` | categories, mine, forUser, saveSkills, saveNeeds, markCompleted, adminStats, matchHints (skills/needs pilot with admin metrics) |

## Services

- **Auth** — JWT (HS256), 30 min access / 30 days refresh, 6-digit linking codes, Telegram initData HMAC-SHA256 validation
- **BFS** — Recursive CTE in PostgreSQL for graph traversal, path finding, and notification distribution
- **Notifications** — BFS distribution with 1:1 ratio (amount = notification count), ignore list, handshake path, Telegram bot and Web Push notifications
- **Telegram Bot** — Collection notifications (new, blocked, closed) via Bot API with rate-limited broadcast (25 msg/sec batches via BullMQ)
- **Web Push** — Browser push notifications via web-push library with VAPID, auto-cleanup of expired subscriptions
- **Currency** — Real-time exchange rates with Redis cache (1h TTL), automatic USD conversion for all amounts
- **Geo** — IP-based country detection for currency auto-selection (ip-api.com)

## BullMQ Workers

| Worker | Description | Schedule |
|--------|-------------|----------|
| `cycle-close` | Auto-close 28-day cycle for regular collections | Every hour |
| `expire-notifications` | Expired notifications (24h) → EXPIRED | Every hour |
| `check-block` | Check intention sum → BLOCKED | On event |
| `tg-broadcast` | Send Telegram bot messages in rate-limited batches (25/sec) | On event |
| `scheduled-post` | Send scheduled broadcast posts at their planned time | Every minute |
| `auto-chain` | Drip campaign: send chain messages based on user registration date + day offset | Every 30 min |
| `cleanup-blocked-pending` | Remove users who blocked the bot from pending connections via TG getChat API | Every hour |

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
| LandingPage | `/welcome` | Public landing with 3D Earth globe (NASA textures) and project description; supports `variant="arvut"` for Hebrew-branded Arvut Hadadit subdomain |
| LoginPage | `/login` | Login via platform (FB/TG/Apple/Google) + demo mode |
| OnboardingPage | `/onboarding` | 3-step onboarding: contacts, budget, skills/needs (auto for new users) |
| DashboardPage | `/` | Network stats (clickable "Whole network" → /network), collections, intentions, emergency alerts (protected → /welcome) |
| NotificationsPage | `/notifications` | Notifications with handshake path and 24h timer |
| CreateCollectionPage | `/create` | Create collection with network reach display (1:1 ratio) |
| CollectionPage | `/collection/:id` | Collection details + intentions + handshake path to creator |
| MyNetworkPage | `/network` | Connection list sorted by date (newest first) with relative time, connection counts + invitations |
| ProfilePage | `/profile/:userId` | Profile with editing, contacts, connections list (collapsible), stats (given/received), handshake path |
| SettingsPage | `/settings` | Language, theme, sounds, font scale, contacts, skills/needs, hide contacts toggle, ignore list |
| FaqPage | `/faq` | FAQ accordion with admin CRUD, view count ranking, LLM localization button, language-aware |
| InvitePage | `/invite/:token` | Accept invitation link |

### 3D Visualization (graph-3d)

- **Earth:** NASA Blue Marble texture with bump map, specular (water), and animated clouds
- **Moon:** Real lunar surface texture, orbiting Earth on scroll
- **Stars:** 3000 realistic small stars with subtle twinkling, hover brightness effect
- **Atmosphere:** Shader-based blue glow around Earth
- **Network:** Animated nodes and edges on Earth's surface (Fibonacci sphere distribution), depth-colored edges, curved links, mini legend, auto-rotate camera

### Frontend Technologies

- **State:** Zustand (auth, theme) + tRPC React Query (server data)
- **Routing:** React Router v7 with ProtectedRoute (onboarding check)
- **UI:** shadcn-style components + Tailwind CSS 3 + Radix UI Tooltip
- **i18n:** i18next v25 + react-i18next (26 languages), auto-detect via navigator.language
- **Icons:** lucide-react + custom SVGs for social networks
- **QR:** qrcode.react
- **3D:** Three.js + @react-three/fiber (lazy loaded)
- **3D Graph:** react-force-graph-3d (lazy loaded)
- **Backup:** @so/gun-backup (Gun.js + IndexedDB)

### Bundle Size (code splitting)

| Chunk | Size | Gzip | Load |
|-------|------|------|------|
| index (main app + demo data) | ~806 KB | ~228 KB | Always |
| three (Three.js core) | ~1284 KB | ~342 KB | Lazy |
| r3f (React Three Fiber) | ~171 KB | ~55 KB | Lazy |
| force-graph (ForceGraph3D) | ~206 KB | ~63 KB | Lazy |
| CSS | ~33 KB | ~6 KB | Always |
| **Total gzip** | | **~694 KB** | **< 5 MB FB limit** |

## Demo Mode

On the `/login` page, there's a "Demo login without registration" button. When clicked, `accessToken: 'demo-token'` is saved to localStorage, and the tRPC client switches to a custom link returning mock data without HTTP requests to the backend.

Mock data (`apps/web/src/lib/demoData.ts`):
- **200 users** — programmatically generated from 20 first names × 10 last names
- **12 direct connections** — displayed in Dashboard and MyNetwork with connection counts
- **3D graph** — ~60 nodes + ~80 edges (3 depth levels)
- **2 own collections** — EMERGENCY 500 USD (collected 280) and REGULAR 1000 EUR (collected 350)
- **1 new collection** — without user participation (to demo the intention form)
- **3 intentions** — to others' collections (50 USD, 100 EUR, 25 USD)
- **6 notifications** — including urgent unread, various types (NEW_COLLECTION, OBLIGATION_RECEIVED, CYCLE_CLOSED, etc.)
- **Network stats** — 156 reachable users across 4 handshake levels with growth data
- **Help stats** — given/received help, by currency breakdown
- **Stats, settings, contacts, invitations** — all procedures covered

## Key Features

- **Unified USD currency** — all amounts stored and displayed in USD; users enter in local currency with real-time conversion preview
- **100+ currencies supported** — full ISO 4217 list with exchange rates from exchangerate-api.com (1h cache)
- **Connection count** — displayed next to every user throughout the app
- **Handshake path** — shown when viewing profiles and collections of non-direct connections
- **Network reach** — real-time calculation of how many people will receive notifications (min of amount or reachable users)
- **1:1 notification ratio** — amount entered = number of people notified
- **Localized statuses** — ACTIVE/BLOCKED/CLOSED/CANCELLED translated in all 26 languages
- **Dark/Light theme** — system preference detection + manual toggle (auto-synced with Telegram theme in Mini App mode)
- **Contact links** — all social network contact types (Telegram, Instagram, Twitter, LinkedIn, VK, Facebook, WhatsApp, Email, Website) open correct URLs via `buildContactUrl`
- **TG username auto-save** — Telegram username automatically saved/updated as contact on each login
- **Online status indicator** — green dot + "Online" when last seen within 5 minutes, gray dot + relative time otherwise; auto-updated on every authenticated API call
- **Hide contacts** — users can hide their contacts from non-connected users; direct connections and notified users still see them
- **Connection nicknames** — custom names for connections (like a phone book), editable from profile page, shown in network list
- **Telegram Mini App** — auto-login via initData, BackButton navigation, haptic feedback on tab switches, theme sync, CSS variable injection from Telegram themeParams
- **Onboarding** — auto-shown for new users, completable flag in database
- **Currency preference** — users can set preferred currency in settings; auto-detected by IP on first visit
- **Monthly support budget** — users can set how much they're willing to contribute monthly; displayed as "Current Capabilities" network-wide sum on dashboard
- **AI Chat Assistant** — floating help button (?) with expandable menu: Chat (AI assistant with glossary/screens/FAQ knowledge) and FAQ page; supports text and voice input with auto-speak for voice queries
- **FAQ Page** — admin-managed FAQ with accordion UI; admins can create/edit/delete questions; LLM auto-translation to all 26 languages; view count ranking; FAQ section on landing page (top 5 + show all)
- **Admin Broadcast** — send messages to all Telegram users with auto-translation per user language; support for text/photo/video; direct reply to specific user by TG ID; scheduled posts with datetime picker; auto-chain drip campaigns by registration day offset; open/read tracking with per-message statistics
- **Feedback to Telegram** — user feedback/suggestions from chat assistant are auto-forwarded to a Telegram group
- **Telegram Bot Notifications** — collection notifications (new, blocked, closed) sent to users' Telegram via bot with rate-limited broadcast (BullMQ worker, 25 msg/sec)
- **Web Push Notifications** — browser push notifications for collection events (new, blocked, closed) via Web Push API with VAPID authentication
- **Arvut Hadadit Subdomain** — Hebrew-branded landing page at `arvuthadadit.orginizer.com` with "ערבות הדדית" branding, forced Hebrew locale, RTL layout, and dedicated translations (`landingArvut.*` in `he.json`)
- **Invite Sharing with OG Image** — share referral link with personalized localized text ("personal invitation from NAME to their circle of close friends") and auto-generated OG image (logo + "Social Organizer"); Web Share API with image, fallback to clipboard
- **Collection Hold (Blocked)** — when collection reaches target amount, existing notifications are expired, COLLECTION_BLOCKED notification is sent to all previously notified users; blocked notifications don't navigate to collection page
- **Smart User Deletion** — users without first-handshake connections are fully deleted from DB (cascade); users with connections get soft-deleted ("Deleted user"); all pending connections cleaned up on deletion
- **Grouped Notifications** — notifications about the same collection (new/blocked/closed) are visually stacked with partial card overlap; pending connection sections are collapsible and placed below collection notifications
- **Skills & Needs System** — 221 skill categories in 15 groups (home, construction, business, legal, creative, health, beauty, transport, auto, IT, education, events, pets, outdoor, agriculture) + "Other" per group with free-text note; unified single-pass selector with dual "Can"/"Need" toggles, search, collapsible accordion groups; isOnline flag distinguishes remote vs local skills; geography fields (city, countryCode) for offline skill matching; auto-chain reminders (day 3, 7, 14, 30) nudge users who haven't filled skills; admin dashboard shows fill rate, match density, top skills/needs

## Terminology (Glossary)

| Term | Description |
|------|-------------|
| **Handshake** | Mutual confirmation of an existing meaningful connection between two people |
| **Intention** | Voluntary decision to help. No pressure — everyone decides for themselves whether to participate |
| **Signal for support** | Creating a collection when support is needed. The network is notified through handshake chains |
| **Handshake chain** | Path of connections between two users through mutual acquaintances |
| **Connection count** | Number of first-level connections (handshakes) a user has |
| **Current Capabilities** | Sum of remaining monthly budgets across the user's network (up to 3 handshake levels) |
| **Monthly budget** | Optional amount a user is willing to contribute to mutual support each month (stored in USD) |

## Current Status

- [x] **Phase 0:** Monorepo infrastructure
- [x] **Phase 1:** Backend (API) — tRPC routers, services, BullMQ workers
- [x] **Phase 2:** Web frontend (MVP) — all 11 pages, UI components, tRPC client, i18n
- [x] **Phase 3:** 3D and optimization — Three.js planet, clouds, graph, Gun.js backup, code splitting
- [x] **Phase 4:** Deploy and testing — Railway config, API serves web frontend, SPEC audit fixes
- [x] **Phase 5:** UX improvements — onboarding, handshake chain, contacts, tooltips, terminology
- [x] **Phase 6:** Visual polish — NASA textures, realistic stars, connection counts everywhere
- [x] **Phase 7:** Telegram Mini App — auto-auth, BackButton, haptics, theme sync, CSS variables

## License

MIT
