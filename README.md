# Social Organizer

The open-source utility of **EXODUS 2.0 — a digital societal innovation**: direct peer-to-peer coordination of already connected people, without a central authority.

The Social Organizer is a coordination tool, not a fundraising service, a platform, a fund or a payment intermediary. It has exactly two signals: a **Need** (a participant's message about what they need) and a **Participation** (another participant's message about their own voluntary participation). It records the two signals and notifies people about them. **It records — it does not evaluate.** Everyone decides for themselves; whatever participants then do, they agree and do directly with each other, outside the tool. It does not accept, transfer, hold or distribute funds and it guarantees no outcome.

Wording rules for the interface, the landing and the assistant, the open questions for the author and the release checklist are in [docs/release/launch-readiness.md](docs/release/launch-readiness.md); the release and distribution plan with its checklist is [docs/release/launch-plan.html](docs/release/launch-plan.html) (open it in a browser, ticks are kept there). In the code and the database a Need is still the `Collection` record and a Participation is the `Obligation` record; those names never reach the interface.

It is a single web build, runtime-detected across surfaces: a regular website, a Telegram Mini App, and native iOS / Android apps (Capacitor wrappers loading the production web URL).

**Theory:** [From Human Behaviour to Social Coordination](https://zenodo.org/records/21629935) (Zenodo) · [P2P Foundation wiki](https://wiki.p2pfoundation.net/From_Human_Behaviour_to_Social_Coordination)
**Questions:** [DSI EXODUS 2.0 assistant](https://chatgpt.com/g/g-MXYLLg8W3-dsi-exodus-2-0)

## Live

- **Web / Production:** https://www.orginizer.com
- **iOS — App Store:** https://apps.apple.com/app/id6768132198
- **Android — Google Play:** https://play.google.com/store/apps/details?id=com.socialorganizer.app
- **Telegram Mini App:** https://t.me/socialorganizer_bot

## Architecture

Turborepo monorepo with pnpm workspaces.

```
Social organizer/
├── apps/
│   ├── api/             # @so/api: Fastify + tRPC + BullMQ
│   ├── web/             # @so/web: React 19 + Vite + Tailwind + ui2
│   └── mobile/          # @so/mobile: React Native Expo (stub)
├── packages/
│   ├── shared/          # @so/shared: types, constants, currencies, validation
│   ├── db/              # @so/db: Prisma schema + migrations (PostgreSQL 17)
│   ├── api-client/      # @so/api-client: tRPC client
│   ├── i18n/            # @so/i18n: i18next (en + ru + 23 more)
│   ├── gun-backup/      # @so/gun-backup: graph copy on device (IndexedDB + Gun.js)
│   ├── graph-3d/        # @so/graph-3d: 3D circle (NetworkGraph only)
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
- **Frontend:** React 19 + Vite + Tailwind CSS + ui2
- **Mobile:** React Native (Expo) + NativeWind (stub)
- **3D:** Three.js + react-force-graph-3d, loaded only with the Circle
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

Windows local setup, the empty-database `db push` caveat, and the test accounts are in
[docs/redesign/README.md](docs/redesign/README.md). Web dev server: http://localhost:3000
(Vite proxies `/trpc`, `/api`, `/gun` to the API on port 3001).

## Database

- **PostgreSQL 17** on port 5434
- Prisma ORM for migrations and client generation

### Data Models

| Model | Description |
|-------|-------------|
| UserAvatar | A photo the person uploaded (bytes, mime, content hash). `User.photoUrl` then holds the short address `/api/avatar/<userId>/<hash>` instead of a data URL |
| User | User with settings, role, onboarding flag, emailVerifiedAt (mailbox proven), preferredCurrency, monthlyBudget, remainingBudget, lastSeen, hideContacts, skillsCompleted |
| UserContact | User contacts (social networks, messengers) |
| PlatformAccount | Platform bindings (FB/TG/Apple/Google) |
| Connection | Connection between users (userAId < userBId) with optional nicknames (nicknameByA, nicknameByB) |
| Collection | A Need: a participant's message about what they need (one time / every 28 days; `EMERGENCY`/`REGULAR` in the DB) with amount in $ (originalAmount/originalCurrency are legacy, no longer written); optional `description` — what it is for, plain text up to 300 characters |
| ObligationReceipt | The author's private "received" mark for one finished cycle of a regular Need (collectionId, userId, cycleNumber, amount, confirmedAt; unique per person and cycle). Written when the cycle closes; `obligationId` becomes null when the person's Participation is removed |
| Obligation | A Participation: a participant's message about their own voluntary participation in a Need, with amount in $ (originalAmount/originalCurrency are legacy, no longer written) |
| Notification | Notification with handshake path |
| IgnoreEntry | Ignore record |
| LinkingCode | 6-digit linking code (5 min TTL) |
| EmailLoginCode | One-time e-mail sign-in code (HMAC only, 10 min TTL, attempts counter) |
| InviteLink | Invitation link |
| ChatMessage | Chat conversation log (user message, assistant response, feedback flag, language) |
| PushSubscription | Web Push subscription (endpoint, keys, user FK) |
| NativePushToken | Native FCM push token for Android Capacitor app (token, platform, user FK) |
| FaqItem | FAQ entry with question, answer, language, sort order, view count, group ID for translations, localization flag (admin-managed with LLM auto-translation) |
| ScheduledPost | Scheduled broadcast post with status (PENDING/SENT/CANCELLED/FAILED), media, button |
| ScheduledPostDelivery | Individual delivery tracking per user per scheduled post with readAt for open stats |
| AutoChainMessage | Drip campaign message: text/media/button, dayOffset from registration, sortOrder, intervalMin |
| AutoChainDelivery | Delivery tracking per user per chain message with readAt for open stats |
| SkillCategory | Skill/need category with key, group, sortOrder, isOnline (221 categories in 15 groups) |
| UserSkill | User's offered skill (link to SkillCategory) with optional note |
| UserNeed | User's need (link to SkillCategory) with optional note |
| UserMilestone | A milestone reached by a user (FIRST_CONNECTION / NEED_UNLOCKED / FIRST_NEED / FIRST_PARTICIPATION; TEN_CONNECTIONS is kept in the enum for old rows only): recorded once per user with achievedAt, the person whose connection reached the first one, and seenAt for the one-time in-app confirmation. A historical fact — removing a connection or closing a Need later does not take it back |
| SkillMatchNotification | Notification when a connected user's skill matches another's need (userId, matchUserId, categoryId) |

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
JWT_SECRET=your-secret-key          # Required, 16+ chars — the API refuses to start without it
TELEGRAM_BOT_TOKEN=your-bot-token    # Required for Telegram Mini App auth
FEEDBACK_CHAT_ID=-100xxxxxxxxxx      # Telegram group chat ID for user feedback
VAPID_PUBLIC_KEY=your-vapid-public-key    # Web Push VAPID public key
VAPID_PRIVATE_KEY=your-vapid-private-key  # Web Push VAPID private key
VAPID_SUBJECT=mailto:admin@example.com    # Web Push VAPID subject
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}  # FCM service account JSON (for native push)
```

## API (tRPC Endpoints)

| Router | Procedures |
|--------|------------|
| `auth` | methods, requestEmailCode, verifyEmailCode, loginWithTelegramWidget, registerWithEmail, loginWithEmail, loginWithTelegram, loginWithGoogle, refresh, generateLinkCode, loginWithLinkCode, claimWithLinkCode |
| `user` | me, update, getById, getStats, getContacts, updateContacts, completeOnboarding, delete, setMonthlyBudget |
| `connection` | list, listForUser, getCount (confirmed connections), graphSlice (2-3 levels), findPath, getNetworkStats (exact counts and people for rings 1–3, rounded counts only for rings 4–5), getNickname, setNickname, revoke ("Remove from circle": deletes the connection and the request rows between the two; no new request comes back) |
| `collection` | create (optional `description`), getById, getPublic, updateAmount, updateChatLink, updateDescription (author only), close, cancel, myActive, myParticipating |
| `obligation` | create, myList, unsubscribe, confirmPayment, setPaid, receiptHistory (author only: "received" marks of past cycles) |
| `notification` | list (cursor pagination), markRead, dismiss, unreadCount |
| `settings` | get, updateLanguage/Theme/Sound/FontScale/HideContacts/Geo, ignoreList/addIgnore/removeIgnore |
| `invite` | generate, accept, getByToken |
| `shake` | register, status, respond (shake to connect: in-memory pairing of two shakes, both confirm, then an in-person connection) |
| `stats` | profile (obligationsGiven + obligationsReceived), help, networkCapabilities, participationFacts (two counts for a profile: Participation reported and marked as received by authors, closed Needs only) |
| `milestone` | list (the four milestones, reached or not, + current direct connections; catches up from stored facts), markSeen |
| `currency` | list, detectCurrency, rates, convert, toUSD |
| `push` | vapidPublicKey, subscribe, unsubscribe, registerNativeToken, unregisterNativeToken |
| `faq` | list, top, all, incrementView, localize, isAdmin, create, update, delete (admin-gated CRUD with view ranking and LLM auto-translation to 26 languages) |
| `broadcast` | sendAll, sendDirect, schedulePost, listScheduled, cancelScheduled, scheduledStats, createChainMessage, listChainMessages, updateChainMessage, deleteChainMessage, chainStats, markRead (admin-only Telegram broadcast with scheduled posts, auto-chain drip campaigns, and open tracking) |
| `skills` | categories, mine, forUser, saveSkills, saveNeeds, markCompleted, adminStats, matchHints — **outside the money MVP: answers NOT_FOUND `FEATURE_DISABLED` unless `FEATURE_SKILLS=true`** |
| `matches` | whoCanHelpMe, whoNeedsMyHelp, myChains, matchNotifications, … — **outside the money MVP: answers NOT_FOUND `FEATURE_DISABLED` unless `FEATURE_SKILLS=true`** |

## Services

- **Auth** — JWT (HS256), 30 min access / 30 days refresh, 6-digit linking codes, Telegram initData HMAC-SHA256 validation, Google & Sign in with Apple via system-browser OAuth (Apple id_token verified against Apple JWKS, no client secret) — see `APPLE_SIGNIN.md`
- **BFS** — In-memory walk over the handshake graph for network counts, path finding and notification distribution. The graph is cached in process memory (`graph-cache.service.ts`) and re-checked by a cheap signature (connection count, newest connection, deleted users). When connections were only added, the new rows are appended to the graph in memory; a removed connection or a deleted account reloads the table. A request never reads the whole connections table. Walk results keep only a parent link per person and build the handshake path when it is read, so a wave over a large network does not hold an array per reached person
- **Far rings** — The 4th and 5th handshakes are shown only as a rounded count ("4–5th: ~400") and an anonymous dust of dots around the 3D graph. Names, links and exact numbers beyond the 3rd ring never leave the server
- **Notifications** — BFS distribution with 1:1 ratio (amount = notification count), ignore list, handshake path, Telegram bot and Web Push notifications. Requests go out in waves, nearest first, up to the 6th handshake: wave 1 on creation, then every 12 hours to the next people not yet notified (people already notified are passed through, so each wave reaches further). Within a ring, people whose budget is used up, who had 2 requests today or 6 this week, who ignored 5 in a row (one probe after 14 days) or whom no channel reaches outside the app get only the in-app entry and do not spend the wave; see [docs/notifications/behaviour-routing.md](docs/notifications/behaviour-routing.md)
- **Network figures** — "People in the network" and "Your network can help" are one figure on every screen (home, profile, ask): everyone a request reaches (up to the 6th handshake), without the person themselves, rounded beyond the 3rd ring (`networkReach` in `network.service.ts`). The walk is kept per person: up to 5 minutes while the graph is unchanged, up to 1 minute after a change somewhere else, and dropped at once for the two people of a new or removed connection, so their own change shows on the next request. Sums over more than 5,000 people use a one-minute snapshot of remaining budgets instead of sending the ids to the database
- **Telegram Bot** — Collection notifications (new, blocked, closed) via Bot API with rate-limited broadcast (25 msg/sec batches via BullMQ)
- **Web Push** — Browser push notifications via web-push library with VAPID, auto-cleanup of expired subscriptions
- **FCM Push** — Native Android push notifications via Firebase Cloud Messaging (firebase-admin), auto-cleanup of expired tokens
- **Milestones** — `milestone.service.ts`: a record of what actually changed for a person. FIRST_CONNECTION (first confirmed connection), NEED_UNLOCKED (the Need tab thresholds are met: `ASK_MIN_DIRECT` direct connections and `ASK_MIN_NETWORK` people in the network), FIRST_NEED, FIRST_PARTICIPATION (in somebody else's Need). Only stored rows count (invite links and pending requests never do); synced right after a new connection, a new Need and a new Participation, and on `milestone.list`, where facts older than a day are stored as seen. Unique per user, no push, no rating, no milestones for amounts or headcount. UI: a reached milestone shows once in the Circle feed with a short sheet, then stays behind one Profile row, "Milestones · 3 of 4", which opens the list with dates (only the person sees it). Migration `20261110120000_milestones_by_meaning` (apply manually before deploy)
- **Currency** — Exchange rates service is kept but not used for amounts: intentions, capacity and goals are entered in $ only (1 $ = 1 unit of participation, SO-40)
- **Geo** — IP-based country detection for currency auto-selection (ip-api.com)

## BullMQ Workers

| Worker | Description | Schedule |
|--------|-------------|----------|
| `cycle-close` | Auto-close 28-day cycle for regular collections + emit `CYCLE_RENEWED` to active subscribers; moves the author's "received" marks of the ended cycle into `ObligationReceipt` and clears them, so the new cycle starts unmarked | Every hour |
| `re-notify` | Repeat waves for one-time (emergency) Needs: once the previous wave is 12 hours old and the Need is active and short of its amount, people who were never told about it get an entry (continues along the graph). Regular Needs are announced once. A wave that finds nobody new leaves a marker (`notification_deliveries`, key `renotify:<collectionId>:<ms>`) so the Need rests for another 12 hours | Every hour (12-hour gate per Need) |
| `special-notify` | People who already reported Participation somewhere hear once, in the app only, about active Needs of the Author / Developer roles | Every hour |
| `cycle-renewal-reminder` | Send `CYCLE_RENEWAL_REMINDER` to subscribers 3 days before next cycle (in-app + TG + push) | Every hour |
| `expire-notifications` | Expired notifications (24h) → EXPIRED; old ones are deleted after 7 days, except request entries of a Need that is still open (they are the record of who was already told) | Every hour |
| `check-block` | Check intention sum → BLOCKED | On event |
| `tg-broadcast` | Send Telegram bot messages in rate-limited batches (25/sec) | On event |
| `scheduled-post` | Send scheduled broadcast posts at their planned time | Every minute |
| `auto-chain` | Drip campaign: send chain messages based on user registration date + day offset. Skills reminders (sortOrder ≥ 100) and messages whose button leads to `/matches`, `/skills`, `/needs` are skipped in the MVP; scheduled posts with such a button are cancelled | Every 30 min |
| `cleanup-blocked-pending` | Remove users who blocked the bot from pending connections via TG getChat API | Every hour |
| `inactive-account-cleanup` | Accounts with no authenticated activity for 2 years (`lastSeen`, else `createdAt`; admins, AUTHOR/DEVELOPER and deleted users excluded) get notices 30 and 7 days ahead (Telegram, push, e-mail; stage in `users.inactivityStage`), then are deleted with the same logic as `user.delete` (`services/account-deletion.service.ts`). Any activity (authenticated request, sign-in/refresh/link code, bot interaction — `services/activity.service.ts` `touchUser`) resets the stage. Deletion always comes ≥ 7 days after the second notice; undelivered notices do not block it (counted in the log). Also exempt: `CLUSTER_ROOT_OVERRIDE` accounts and authors of an ACTIVE/BLOCKED collection with another person's pledge. Max 300 users per stage per run. Without Redis it runs on an in-process timer (first run 5 min after start, then every 24 h); a Postgres advisory lock keeps it to one run at a time. Check: `pnpm --filter @so/api exec tsx scripts/check-inactive-cleanup.ts` (local DB only) | Daily |

## Backups & Disaster Recovery

The network must survive losing the database or the hosting provider. Three independent copies:

1. **Nightly database dump → Cloudflare R2** (off Railway). Railway cron service `db-backup` (`ops/backup/`, 01:17 UTC) runs `pg_dump --format=custom` and uploads it through the `so-backup-ingest` Worker into the private bucket `social-organizer-backups`. Retention: `daily/` 35 days, `monthly/` (1st of month) 400 days. The Worker holds the bucket binding; the service only knows its ingest key (`BACKUP_INGEST_KEY`), not a Cloudflare account token. List: `GET https://so-backup-ingest.lambertain.workers.dev/list` with `Authorization: Bearer <key>`.
2. **Gun.js relay on a persistent volume.** The API attaches the Gun relay (`apps/api/src/gun-relay.ts`, file `gun-data`); `/app/gun-data` is a Railway volume, so the server-side graph copy survives deploys. The relay needs a valid access token (`/gun?token=<jwt>`, added by `@so/gun-backup` on every reconnect) and each connection only reads and writes its own node `so-backup/<userId>`.
3. **Graph copy on every device** (shown to the person when there is no connection, see "Offline saved copy"). `useGraphSync` saves the user's network (3 levels: nodes + edges) every 5 minutes to IndexedDB (`@so/gun-backup`), plus Gun for cross-device sync. Before 03.10.2026 the copy lived only in memory — Gun ran with `localStorage:false` and no storage adapter.

### Security

- **Tokens.** Every request is authorised only by an access token with a valid HMAC signature and expiry (`verifyToken` in `apps/api/src/services/auth.service.ts`); refresh tokens are accepted only by `auth.refresh`. `JWT_SECRET` has no default.
- **Single sign-in screen (SO-21)** — `/login` shows one screen "Sign in or create an account" with Google, Apple, Telegram and "E-mail: we'll send a code"; the server decides whether the account is new, no password is needed. `auth.methods` tells which methods are available, a disabled one is hidden (no e-mail service in production → the e-mail button falls back to e-mail + password; Telegram Login Widget is off until `TELEGRAM_LOGIN_WIDGET=1`, then the button opens the bot's mini app). The last used method (method only, no account data) is kept on the device for a hint.
- **E-mail codes** — `auth.requestEmailCode` / `auth.verifyEmailCode` (`services/email-code.service.ts`): 6 digits, 10 min, only the latest code works, a new code no sooner than 60 s and at most 5 per address per hour, 5 wrong entries burn the code, one use (a second request with the same code gets nothing). The answer to "send a code" does not reveal whether the address is registered. Only an HMAC of the code is stored; codes and tokens are never logged. Mail goes through Resend (`RESEND_API_KEY`, `MAIL_FROM`); without a key a non-production server writes messages to a local outbox file (`DEV_MAIL_OUTBOX`).
- **Account matching** — `services/identity.service.ts`: Google/Apple sign-in finds the person by the provider account, then by an e-mail proven on both sides (`emailVerifiedAt`, or an account that never had a password). A password account whose e-mail was never proven is not taken over: the answer is `ACCOUNT_EXISTS_OTHER_METHOD`, the screen asks to sign in with an e-mail code first. A parallel first sign-in with one provider account creates one user. Telegram on the website uses the Login Widget, checked on the server (`validateTelegramWidget`); a bare Telegram id is never accepted.
- **Assistant limits** (in memory, per person): `chat.send` 30 per hour and 100 per day, `chat.speak` 40 per hour, plus a daily cap for everyone together (5,000 messages, 3,000 voice answers); over the limit the answer is `TOO_MANY_REQUESTS`. Change with `CHAT_LIMIT_PER_HOUR`, `CHAT_LIMIT_PER_DAY`, `CHAT_LIMIT_ALL_PER_DAY`, `SPEAK_LIMIT_PER_HOUR`, `SPEAK_LIMIT_ALL_PER_DAY`. The system prompt (screen guide + FAQ, translated when the language has no FAQ rows) is kept for 10 minutes per language.
- **Rate limits** (in memory, per client IP from `X-Real-IP`): 600 requests/min on everything except `/api/avatar/*`; 30 per 15 min on guessable sign-in procedures (e-mail code request/check, email login/register, link-code login/claim); 10 wrong link-code attempts per hour per IP (and per Telegram/Apple account) across every flow that accepts a 6-digit code. Link-code issue and use are logged with `[link-code]`.
- **Data exposure.** `user.me` never returns the password hash or coordinates; `user.getById` returns a phone only under the same rule as contacts (`canViewContacts`).
- **Push.** `push.subscribe` won't move an endpoint owned by another user unless the subscription keys match (same browser, another account) — otherwise 403.
- **Received marks** are the author's own record: `collection.getById` returns `confirmedAt` only to the author of the Need. Other people see only the two profile counts from `stats.participationFacts`.
- **Collection chat links** must be `http(s)://` (no `javascript:` links on the collection page or in bot buttons).
- **Telegram webhook** is registered with a `secret_token` (derived from the bot token); calls without the matching `X-Telegram-Bot-Api-Secret-Token` header get 401.
- **CORS** allows only our own origins (orginizer.com, the Capacitor app, local dev, `WEB_APP_URL`).
- **Image proxy** (`/api/image-proxy`) fetches only https avatars from Telegram (`t.me`, `*.telesco.pe`, Telegram CDNs) and Google (`*.googleusercontent.com`), only jpeg/png/webp/gif up to 5 MB, with `nosniff`.
- **Uploaded photos** (`services/avatar.service.ts`): `user.update` accepts a JPEG/PNG/WebP data URL up to 150 KB, stores the bytes in `user_avatars` and puts `/api/avatar/<userId>/<hash>` into `photoUrl`; any other data URL is refused. The address answers only while it is the person's current photo (cached as immutable; a new photo has a new address). Photos stored the old way are moved at start-up. Until migration `20261111120000_load_fixes` is applied, photos stay data URLs as before.
- **Compression.** JSON and text answers over 1 KB are sent with brotli or gzip (`@fastify/compress`).
- **No credentials in the repo.** Ops scripts read the database from `DATABASE_URL` (or `RAILWAY_DATABASE_URL` for scripts that write to both local and Railway); passwords and tokens live in Railway variables and the portal.

### Restore the database on a new host
```
curl -H "Authorization: Bearer $KEY" https://so-backup-ingest.lambertain.workers.dev/list          # pick the latest daily/*.dump
curl -H "Authorization: Bearer $KEY" -o so.dump https://so-backup-ingest.lambertain.workers.dev/b/daily/<file>
createdb social_organizer && pg_restore --no-owner --no-acl -d "$NEW_DATABASE_URL" so.dump
```
Then point `DATABASE_URL` of the API to the new database and deploy. Never restore over the production DB in place — restore into a new database and switch.

### Incident 26.09–03.10.2026
The hourly `cleanup-blocked-pending` worker treated any failed `getChat` as "user blocked the bot" and deleted 29 active users at midnight runs (hard delete for users without invitees, soft delete otherwise). Fixed in `768157c`: only HTTP 403 counts as blocked, and a run stops after 3 removals with an alert to the support chat. On 11.11.2026 the send path did the same to a newcomer: the first notification after their invite was confirmed got 403 "bot can't initiate conversation with a user" (they signed in without pressing Start in the bot), the account was muted and they made a second one with Google. Now only an explicit "bot was blocked by the user" / "user is deactivated" mutes anyone (`isBlockedError`, also in the nightly `getChat` check), every 400/403 send failure is logged with Telegram's description, and a muted account comes back when its owner signs in again (`account-restore.service.ts`: a deleted account that still has connections was muted by the bot, since the owner's own deletion removes every connection). Local check: `apps/api/scripts/check-account-recovery.ts`. 28 wrongly removed users were restored (soft-deleted ones fully; hard-deleted ones re-created with the same ids, Telegram link and contacts from the support chat log — their connections were lost).

## Deployment

- **Railway:** Auto-deploy on `git push` to main
- **URL:** https://www.orginizer.com
- **Healthcheck:** /health
- **Services:** PostgreSQL 17, Redis 7, Fastify API
- **GitHub:** https://github.com/element1965/Social-organizer

### Staging (redesign test server)

A separate Railway environment `staging` in the same project runs the `redesign` branch with its own Postgres and Redis.

- **URL:** https://social-organizer-staging.up.railway.app (auto-deploy on `git push` to `redesign`)
- **Data:** fictional test people from `packages/db/prisma/seed-dev.ts` (no production data). Sign in by e-mail as `anna@test.local` (active), `big@test.local` (large network: 36 direct, 244 people over three levels, ~400 more in the 4th–5th), `new@test.local` (empty circle) or `maria@test.local`.
- **Sign-in codes:** there is no Resend key; `MAIL_LOG_TO_STDOUT=1` prints each code to the service log (Railway → staging → Social-organizer → Logs, search `mail:test-outbox`).
- **Never set** `TELEGRAM_BOT_TOKEN`, `FEEDBACK_CHAT_ID`, `FIREBASE_SERVICE_ACCOUNT` or `VAPID_*` in staging: on start the API re-points the bot webhook, and push keys would reach real devices. `JWT_SECRET` differs from production.
- **Schema / reseed:** staging uses `prisma db push`, not migrations. With the staging public URL in `DATABASE_URL`: `cd packages/db && npx prisma db push`, then `SEED_DEV_ALLOW_HOST=<host:port> npx tsx prisma/seed-dev.ts` (the seed wipes the database and refuses any host not named there).
- **db-backup** exists in staging only as a copy without its R2 keys, so it uploads nothing.

### Google Play (Android)

Capacitor-based Android wrapper (`apps/web/android/`). The app loads the production web URL (`https://www.orginizer.com`).

```bash
# Build release AAB (requires Android Studio installed)
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
cd apps/web/android && ./gradlew bundleRelease
```

Output: `apps/web/android/app/build/outputs/bundle/release/app-release.aab`

- **Package:** `com.socialorganizer.app`
- **Keystore:** `keystore/release.jks`
- **Version:** bump `versionCode` and `versionName` in `apps/web/android/app/build.gradle`
- **Upload:** manually via Google Play Console

#### Staging test app (on a real phone)

The `staging` build type wraps the Railway staging URL instead of production. It is debug-signed, has its own package `com.socialorganizer.app.staging` and the name **SO Staging**, so it installs next to the Google Play app.

```bash
# Phone connected over USB with USB debugging on
node scripts/build-android-staging.mjs            # web build → cap sync → assembleStaging → adb install + launch
node scripts/build-android-staging.mjs --no-web   # reuse apps/web/dist
```

- The URL comes from `-PstagingUrl` (default `https://social-organizer-staging.up.railway.app`); Gradle writes an overriding `capacitor.config.json` into the staging assets.
- `src/staging/google-services.json` is the production Firebase config with the staging package name, so the build passes. Native push for staging needs the package registered as its own Android app in Firebase, plus a push key on a backend that never reaches real users (staging has none on purpose).
- Sign in with the email code from the staging logs. Google and Apple sign-in return through the `socialorganizer://` scheme, which the store app also registers, so Android may ask which app should open it.

#### App Links (invite QR opens the app)

`https://<host>/invite/<token>` links (the live QR, shared invites) open the installed app instead of the browser: a phone camera or Google Lens offers the app, and the app routes the link to its invite page (`appLinkPath` in `App.tsx`).

- **Manifest:** an `autoVerify` intent-filter for `/invite/`; hosts come from `manifestPlaceholders` in `app/build.gradle` (release: `www.orginizer.com` and `orginizer.com`, staging build: the staging domain).
- **Verification file:** the API serves `/.well-known/assetlinks.json` from env `ANDROID_CERT_SHA256` (comma-separated SHA-256 signing-cert fingerprints) and `ANDROID_APP_PACKAGE` (default `com.socialorganizer.app`). Without fingerprints it returns 404.
- **Production:** use the Play App Signing certificate (Play Console → App integrity → App signing → SHA-256), not the upload key. The filter ships with the next store build.
- **Staging:** `ANDROID_APP_PACKAGE=com.socialorganizer.app.staging`, `ANDROID_CERT_SHA256` = the debug keystore fingerprint (`keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android`).
- **Check on a device:** `adb shell pm get-app-links com.socialorganizer.app.staging` shows `verified` once the file is served; re-run verification with `adb shell pm verify-app-links --re-verify <package>`.
- Live QR codes are always black on white with a 4-module quiet zone: phone cameras do not find a code that touches a dark background.

### iOS (App Store)

Capacitor-based iOS wrapper (`apps/web/ios/`) that loads the production web URL. Build via Xcode (`bash scripts/deploy-ios.sh` → Archive → Upload). Bundle `com.socialorganizer.app`, Apple ID `6768132198`. Listing/metadata are managed through the App Store Connect API (key in `secrets/asc/`). Because the UI is served from the web, most fixes ship via a Railway deploy and a plain re-submit of the same binary — a new Xcode archive is only needed for native/Info.plist changes. Full flow in `IOS_DEPLOY.md`; Sign in with Apple setup in `APPLE_SIGNIN.md`.

### Getting the app from the web version

Signed-in users of the web version also see the stores, not only guests on the landing (`components/app/GetApp.tsx`):

- **Circle card** — in a phone browser only (Android → Google Play, iPhone → App Store), below the event feed. Closing it hides it for 30 days (`localStorage` `so.getApp.dismissedAt`). Not shown in the native app, in the Telegram Mini App, or on a computer
- **Profile → More → "App for your phone"** — a sheet with the store for this device; on a computer (and Telegram Desktop) both stores and a QR to `/get`, which opens the right store on the phone. Hidden in the native app; shown in the Mini App, where links open through `Telegram.WebApp.openLink`

### Invite referral across surfaces

The landing download buttons carry the inviter's token so new users join the inviter's cluster on first handshake:

- **Telegram:** `?start=invite_TOKEN` → bot → `/invite/TOKEN` (delivered to the Mini App)
- **Google Play:** `&referrer=invite_TOKEN` → Play Install Referrer → `MainActivity.java` loads `/invite/TOKEN` (delivered to the app)
- **App Store:** `?ct=invite_TOKEN` Apple campaign token — App Store Connect analytics only; iOS has no Install Referrer, so the invite is not auto-applied in-app after install
- **Browser:** "Or continue in the browser" under the buttons → `/login`; the token waits in `pendingInviteToken` and is accepted after sign-up

There is one invite link per user — `https://www.orginizer.com/i/TOKEN`, shared from Add (link and QR). TOKEN is the personal ID (`referralSlug`, 3–30 characters: letters, numbers, `_`, `-`) or, until one is chosen, the user id; the ID is edited right on the Add card ("Change link") or in Account. `/i/TOKEN` redirects to `/invite/TOKEN` (`SlugRedirect`); the older `/?invite=TOKEN` form keeps working. The person who opens it picks Telegram, the app or the browser. Inside the installed app `/invite/TOKEN` goes straight to `/login` (no landing), and `pendingInviteToken` is kept until `InvitePage` accepts it — also across the Google/Apple deep-link return (`socialorganizer://auth-success`).

### Connecting Telegram to an existing account

Account (`/me/account`) → "Connect Telegram" (shown to users who signed in with Google / e-mail / Apple) creates a link code and opens `t.me/<bot>?startapp=link_CODE` without showing the digits. `loginWithTelegram` reads `start_param` from the signed initData and calls `linkTelegramByCode` (`apps/api/src/services/telegram-link.service.ts`): a Telegram that was never used is attached to the code owner; an empty duplicate account (no connections, collections or obligations) is merged — Telegram and pending invite requests move over, the duplicate is deleted; a duplicate with data is left alone (`linkResult: 'conflict'`, the mini app shows a message) — unless the code owner is the empty one: a person who came back with Google / Apple / e-mail and got a fresh account is folded into the Telegram account with the network (`mergeEmptyAccountInto`: sign-in methods, a proven e-mail and open invite requests move over, the empty account is deleted, `linkResult: 'merged'`). Signing in with Google from a Telegram link code folds an empty Google account the same way. A new account made with Google, Apple or e-mail sees "Already used Social Organizer through Telegram? Connect it" on the intro. The Telegram contact is editable by hand until Telegram is connected; the account e-mail fills the e-mail contact.

## Web Frontend (apps/web)

React 19 SPA with tRPC client.

### Pages

Route pages other than the guest landing are `React.lazy`. The Circle chunk is prefetched after sign-in. A failed lazy chunk retries the import once; if the preload still fails, the page reloads once (a sessionStorage timestamp stops a loop) and then shows a reload screen. `telegram-web-app.js` is injected during HTML parse, before the app entry, only inside Telegram: `tgWebAppData` or `tgWebApp` in the URL or hash, a Telegram user agent, `window.TelegramWebviewProxy`, sessionStorage `__telegram__initParams`, or an iframe that has those stored params or a `tgWebApp` hash. That still matches after a full-page reload inside Telegram Desktop, iOS, Android, and Web A/K. A normal browser does not request the script.

| Page | Path | Description |
|------|------|-------------|
| LandingPage | `/` (guest) | Public site. Signed-in `/` is the Circle |
| HowPage | `/how` | How it works |
| LoginPage | `/login` | E-mail code, Telegram, Google, Apple |
| IntroPage | `/intro` | First-run intro (`/onboarding` redirects here) |
| SeedPage | `/seed` | First-run step after the intro: name (prefilled from the sign-up, required) and minimum participation |
| CirclePage | `/` (signed in) | Circle: 3D graph, feed, tab bar |
| AskPage | `/ask` | Report a Need (`/create` redirects here). A compact link in the title row ("All · N", open plus past) leads to the list at `/me/history`; it takes no height, so the form and its button stay on the first screen |
| AddPage | `/add`, `/add/qr`, `/add/scan` | Invite link, QR, scan |
| ProfilePage | `/me` | Own profile (`/settings` redirects here) |
| HistoryPage | `/me/history` | Own Needs and the ones the person takes part in, tabs Open and Past (opens on Past when nothing is open). On top, a "Participation so far" card (replaces the old Helped / Helped me half-circle of the SOS screen): two equal columns — the amount and number of the person's own pledges, and of pledges in their Needs (`stats.help`) — plus, for closed Needs, how many pledges authors marked as received (`stats.participationFacts`). No ratio or balance is shown on purpose; the card is hidden while both counts are zero. It is deliberately not on the Ask screen, so a request never looks like a debt. Reached from the Need tab and from Profile; both rows show the same counts (`useNeedCounts`) |
| AccountPage | `/me/account` | Account, including Connect Telegram |
| PersonPage | `/person/:id` | Another person (`/profile/:userId` redirects here) |
| PeoplePage | `/people` | People in the circle |
| CollectionPage | `/collection/:id` | One collection |
| SosLandingPage | `/sos/:id` | Public collection page from a share link |
| InvitePage | `/invite/:token` | Accept an invitation |
| Help / FAQ / assistant | `/me/help`, `/me/help/faq`, `/me/help/assistant` | Help, FAQ, assistant (`/faq` redirects to `/me/help`) |

Old paths `/dashboard`, `/network`, `/notifications`, `/matches`, `/skills`, `/needs`, `/welcome`, and `/arvut` redirect to `/`.

### 3D Visualization (graph-3d)

`NetworkGraph` (react-force-graph-3d) draws the signed-in Circle. The planet, globe, cloud, and handshake-path scenes are gone. The graph chunk (Three.js plus the force-graph libraries, about 1.3 MB / 357 KB gzip) loads when the Circle opens, not on the guest landing.

- *Stable data* — node objects are kept between renders and only a structural change (who is in the graph, names, photos) updates the graph; `connectionCount` / `lastSeen` are applied in place. A parent re-render no longer rebuilds all nodes and restarts the simulation (it was ~8 FPS on 500 nodes).
- *Cheap nodes* — shared textures/materials, sprites instead of spheres, one frame loop for LOD (avatar + label → dot → star-like dot with a minimum on-screen size; near dots are capped at 11 px and photos at 34 px on screen, so the camera passing close never fills the view with one node), labels and photos created lazily within a per-frame budget (500 nodes mount in ~0.4 s instead of ~4.5 s); decorative sprites are excluded from hover raycasting; the pulse ring exists only on nodes that show it.
- *Batched drawing* — all links are one `LineSegments` (per-vertex colour and alpha; the highlighted path is a second small one, curved) and all node dots are one `Points` with a small shader, sorted far to near each frame; per-node sprites stay only as invisible tap/hover targets. A 500-person graph went from ~1100 draw calls per frame to ~22 (CPU per frame 6.4 → 3.3 ms on a desktop). The pixel ratio is capped at 2 and lowered step by step while frames come late (one step only on 30 Hz screens), then raised back. Performance demo: `pnpm --filter @so/graph-3d demo`, open `http://localhost:5199/?n=500` (synthetic network; `window.__SO_GRAPH_DEBUG__` exposes the force graph and our frame time).
- *Shape* — a gentle radial force keeps each handshake depth on its own spherical shell (you in the middle, then 1°, 2°, 3°), so the network forms a round cloud instead of sprawling like a tree (`BALL_STRENGTH`, `BALL_SHELLS`; set the strength to 0 for a free-form layout). The default centering force is removed (it shifted the cloud every tick against the pinned center) and a speed limit (`MAX_NODE_SPEED`) keeps the first ticks from exploding, so nodes settle without jerks.
- *Camera and LOD* — LOD switches with hysteresis (no avatar/dot flicker on a border); nodes right in front of the lens fade out, so the camera passes through the 1° shell instead of getting stuck behind a huge avatar.
- *Memory between visits* — avatar textures live in a shared LRU (`avatarCache.ts`) and the settled layout in `layoutCache.ts`; screens hand the saved camera back as `initialView`, which skips the intro flight. Nodes already shown once are remembered per owner, so coming back to the Circle does not replay the pop-in. Leaving while the layout still moves saves it too, marked unsettled: the next visit starts from there and lets it finish settling instead of freezing it half-way.
- *Layers and names* — photos and the "me" tile write depth only inside the disc / tile (`alphaTest`), and the dot layer draws after every sprite (`renderOrder` 2.5), so a dot or name is hidden only by a face really in front of it. Names are thinned out on their real on-screen box: one that would cover a kept name or a nearer avatar is hidden, and none are drawn under the UI at the bottom of the canvas (`labelInsetBottom`; the phone Circle also puts a soft scrim under the ring chips). Names fade in and out (180 ms) and a name that just left the nearest few stays 1.5 s, so a turning camera does not make them hop. The hover tooltip is off on touch screens (`hover: none`).
- *Motion* — "bloom": nodes start next to their parent and unfold with low friction (glide/overshoot) while popping in (staggered by depth); gentle floating and a synchronized online pulse; hover grows a node; orbit controls with damping (inertia after a fling), auto-rotate that eases back in after 2.5 s of inactivity; the camera frames the whole graph and flies along an arc (own tween, cancelled as soon as the user touches the view); buttons "Focus on me" and "Show whole network".
- *Safety* — names in the hover tooltip are HTML-escaped; WebGL teardown is deferred so a StrictMode double effect cannot kill the renderer; the simulation is never reheated before the library has digested the data (that crashed the render loop on remount — black screen on Android).

### Frontend Technologies

- **State:** Zustand (auth, theme) + tRPC React Query (server data). Polling: the unread counter every 30 s (one timer, in the shell), incoming acquaintance requests every 20 s, feed lists every 60 s. The heavy network queries (`graphSlice`, `connection.list`, `getNetworkStats`, `networkCapabilities`) are re-read every 5 minutes with a 60 s `staleTime`; `connection.getCount` is watched every minute and a change in it refreshes them at once (`components/circle/network.ts`). The single retry waits 1–3 s at random, and the refresh after an outage is spread over 4 s
- **Routing:** React Router v7. Guest `/` stays eager; other pages are lazy behind a small spinner
- **UI:** ui2 components + semantic tokens in `styles/tokens.css`. A few older screens still use the legacy Tailwind ramps
- **i18n:** i18next v25 + react-i18next (28 languages), auto-detect via navigator.language
- **Icons:** lucide-react + custom SVGs for social networks
- **QR:** qrcode.react (the scanner chunk loads jsQR on `/add/scan`). Every code carries the dark logo in the centre (`lib/qrLogo.ts`, error correction level H)
- **Backup:** @so/gun-backup (Gun.js + IndexedDB), started from the signed-in shell

### Bundle size (vite build, guest landing)

Measured on this branch. The guest document does not preload Three.js, the force-graph, or Gun, and it does not request `telegram-web-app.js`.

| Chunk | Raw | Gzip | When |
|-------|-----|------|------|
| index (entry, includes locales) | 1560 KB | 474 KB | Always |
| CSS | 76 KB | 15 KB | Always |
| CirclePage | 42 KB | 13 KB | After sign-in (prefetched) |
| graph3d (Three.js + force-graph) | 1317 KB | 357 KB | When the Circle graph loads |
| gun | 43 KB | 17 KB | Signed-in shell |
| jsQR | 131 KB | 47 KB | Scan screen |

Before this split the entry was 1858 KB / 558 KB gzip and the landing also pulled Three.js (1284 KB / 342 KB gzip), React Three Fiber (171 KB / 55 KB gzip) and the force-graph chunk (206 KB / 63 KB gzip), plus a render-blocking Telegram script. Local Lighthouse mobile on `vite preview` of `/`: performance 97 → 96, accessibility 94 → 94. First contentful paint 1.8 s → 0.9 s, time to interactive 7.6 s → 4.9 s, unused JavaScript about 544 KiB → 156 KiB. The earlier production mobile score of 74 was a different run (throttled network, the old single bundle). The entry is still over 600 KB because the locale catalogs ship in it.

## Key Features

- **Shake to connect** — two people shake their phones at the same moment on any screen of the app. Each phone calls `shake.register`; the server (`services/shake.service.ts`, in memory, single API instance) pairs shakes that arrived within 3 s of each other (a shake keeps searching for 6 s) from the same public IP or close geolocation (sent only if the person already allowed it, never prompted), waiting 0.5 s so a third shake nearby turns the result into "crowded" (use the QR code) instead of a wrong match. Both see the other person and confirm; then they are connected in person (`connectInPersonTx`, the same path as the live QR, within the 150 limit). Closing the sheet declines. After any new connection (shake, QR scan, confirmed request) `apps/web/src/lib/refreshNetwork.ts` refetches the circle, graph, network figures and milestones at once, on both phones. The new person is drawn on the first ring right away and a "joining" card at the top of the Circle feed (pulsing avatar, progress line, the line to them lit on the graph) stays until the graph slice with their network is back, then says how much the network grew (`components/circle/joining.ts`, `JoinCard.tsx`); the slice starts loading at the moment of the join, before the Circle opens. The other phone learns of the join from the cheap connection count: every 4 s while the live QR is shown (with a banner), every 20 s on the Circle. Detector: `apps/web/src/hooks/useShakeDetector.ts`; overlay: `components/shake/ShakeProvider.tsx` (ignored while typing, while the QR camera is on or while a sheet is open). iOS: in the native app the first tap anywhere silently asks for motion access (Capacitor grants it without a dialog); in a plain mobile browser the Add and QR screens show an "Enable shake" button. Two shakes with no shared network (same IPv4, or the same IPv6 /64 for phones on one Wi-Fi) and no close geo are paired only when they are the only two shakes in the window, and such a pair is blind: both phones show the same three-symbol code and neither person is shown — no name, photo or "already connected" — until both confirm that the code matches on each other's screen; a different code declines and who it was stays unknown. `status` and `respond` are rate-limited per person. Geolocation counts only with an accuracy of 200 m or better, and two fixes match within 150–500 m, so a claimed coarse position cannot pair strangers across a city. "Already connected" is read once, before anyone answers, so a pair this shake just connected is not reported as already connected; a 150-limit error is worded for each of the two. Local checks: `apps/api/scripts/check-shake-matcher.ts` (matcher) and `apps/api/scripts/check-connect-flows.ts` (personal link, live QR and shake end to end against a local database)
- **Start-up loader** — `index.html` holds an inline CSS loader inside `#root` (brand mark with two rings of orbiting dots, light/dark from the early theme class, static with reduced motion) that shows before the bundle loads; `components/ui2/AppLoader.tsx` renders the same picture as the start-up Suspense and sign-in fallback, continues its animation and fades out over the first screen; after 8 s it adds "Still loading…"
- **One unit — $** — all amounts are entered, stored and displayed in $ (conditional dollars, 1 $ = 1 unit of participation); no currency choice and no conversion
- **Connection count** — displayed next to every user throughout the app
- **Handshake path** — shown when viewing profiles and collections of non-direct connections
- **Network reach** — real-time calculation of how many people will receive notifications (min of amount or reachable users)
- **1:1 notification ratio** — amount entered = number of people notified
- **Localized statuses** — ACTIVE/BLOCKED/CLOSED/CANCELLED translated in all 26 languages
- **Dark/Light theme** — system preference detection + manual toggle (auto-synced with Telegram theme in Mini App mode)
- **Contact links** — all social network contact types (Telegram, Instagram, Twitter, LinkedIn, VK, Facebook, WhatsApp, Email, Website) open correct URLs via `buildContactUrl`
- **TG username auto-save** — Telegram username automatically saved/updated as contact on each login
- **Online status indicator** — green dot + "Online" when last seen within 5 minutes, gray dot + relative time otherwise; auto-updated on every authenticated API call
- **Hide contacts** — off by default; users can hide their contacts from non-connected users; direct connections and notified users still see them
- **Connection nicknames** — custom names for connections (like a phone book), editable from the person screen; the nickname replaces the real name across the circle, people, and collections
- **Telegram Mini App** — auto-login via initData, BackButton navigation, haptic feedback on tab switches, theme sync, CSS variable injection from Telegram themeParams
- **Onboarding** — auto-shown for new users, completable flag in database
- **Monthly support budget** — users can set how much they're willing to contribute monthly, from `/me/stake`
- **AI Chat Assistant** — a screen at `/me/help/assistant` (there is no floating button). It supports text and voice input. A failed send keeps the text with a Retry
- **FAQ** — admin-managed FAQ at `/me/help/faq`; admins can create, edit, and delete questions, with LLM auto-translation
- **Admin Broadcast** — send messages to all Telegram users with auto-translation per user language; support for text/photo/video; direct reply to specific user by TG ID; scheduled posts with datetime picker; auto-chain drip campaigns by registration day offset; open/read tracking with per-message statistics
- **Admin mode** — admins (`ADMIN_IDS`) get an "Admins only" section at the bottom of `/me`: project day (calendar days in Kyiv time since the admin's sign-up), Broadcast (`/me/broadcast`), Statistics (`/me/stats`: all users and clusters), Support Chat (`/support`) and the open circle questions (moderation). On any person's page (`/person/:id`) admins also see an "Admins only" block: the person's pledge this period, registration date with day count, direct connections (a sheet with each connection's pledge; `connection.listForUser` skips the visibility check for admins), Needs created/open/with participation, Needs they took part in, and the participation history (given / received). Admins can also pause a Need on its page and edit the FAQ. Other users never see these blocks; the API checks admin rights on its side. Local check: run the API with `ADMIN_IDS=<user id>` and, for a second local stack, the web dev server with `DEV_API_TARGET=http://localhost:<api port>`
- **Feedback to Telegram** — user feedback/suggestions from chat assistant are auto-forwarded to a Telegram group
- **Telegram Bot Notifications** — collection notifications (new, blocked, closed) sent to users' Telegram via bot with rate-limited broadcast (BullMQ worker, 25 msg/sec)
- **Web Push Notifications** — browser push notifications for collection events (new, blocked, closed) via Web Push API with VAPID authentication
- **Native FCM Push Notifications** — Android Capacitor app receives native push notifications via Firebase Cloud Messaging; unified push service sends to both Web Push and FCM in parallel; auto-cleanup of expired tokens. Push is offered once on start with "Not now"; declining never blocks the app (events stay in the in-app journal, push can be turned on in Settings). Tapping a push reloads the data of the opened page
- **Arvut Hadadit** — the separate Hebrew landing was removed. `/arvut` and `/welcome` redirect to `/`
- **Invite Sharing with OG Image** — share referral link with personalized localized text ("personal invitation from NAME to their circle of close friends") and auto-generated OG image (logo + "Social Organizer"); Web Share API with image, fallback to clipboard
- **Connection requests, one rule set** — the personal link, a direct request from a person page and the bot's lost-link fallback open a request through `openConnectionRequest` (`connection-request.service.ts`): a request the person declined is not sent again ("not confirmed" on the page; meeting in person by QR or shake still connects), a request withdrawn less than a day ago waits out the cooldown, and an older row makes room for a new one with its own notification. The link checks the 150 limit before the request. A live QR that expired while a newcomer was signing up still shows the inviter, and accepting it from the guest page sends an ordinary request; scanned in the app, an expired code asks for a fresh one. The guest page gets only the fields it shows. Names in Telegram messages are HTML-escaped (`tg-html.ts`)
- **Confirmation for the person who asked, and attention badges** — when a request is confirmed, the person who sent it hears it in Telegram or push as before, and now also in the app: the Circle feed shows "X confirmed the acquaintance" for 7 days (`pending.acceptedRecent`; the first-handshake milestone covers the very first one). The phone tab bar and the desktop sidebar carry a number on Circle (Needs of others still waiting for a decision + requests to confirm + confirmations not yet shown, from `notification.attention` and `useAcceptedRecent`) and a dot on Add while requests to confirm wait. A confirmation counts until the Circle feed has shown it; that "seen" mark lives on the device (`so.acceptedSeen`).
- **Invite Fallback (server-side safety net)** — the bot tracks the invite token on `/start invite_TOKEN` (BotStart.inviteToken); if the mini app loses it (failed page load, menu-button open without start_param), `loginWithTelegram` applies the tracked token and creates the pending connection to the inviter anyway; a startup backfill (`backfillBotStartInvites`) retroactively links registered-but-disconnected users, consuming tokens on apply
- **Collection Hold (Blocked)** — when collection reaches target amount, existing notifications are expired, COLLECTION_BLOCKED notification is sent to all previously notified users; blocked notifications don't navigate to collection page
- **Smart User Deletion** — users without first-handshake connections are fully deleted from DB (cascade); users with connections get soft-deleted ("Deleted user"); all pending connections cleaned up on deletion
- **Grouped Notifications** — notifications about the same collection (new/blocked/closed) are visually stacked with partial card overlap; pending connection sections are collapsible and placed below collection notifications
- **Session renewal** — access tokens live 30 minutes (`JWT_ACCESS_TTL_MINUTES`); the web client (`apps/web/src/lib/trpc.ts`, `authFetch`) renews them with `auth.refresh` before they expire and once more after a 401, one renewal at a time. Without it every web/app user was signed out 30 minutes after sign-in once SO-14 started checking expiry. A broken refresh token still signs the user out as before.
- **First acquaintance (SO-40)** — connection requests show in the circle feed. The old acquaintance card is gone. Every answer to a request — app (`pending.accept/reject`), Telegram bot buttons (`pc_a:` / `pc_r:` callbacks) — goes through `apps/api/src/services/connection-request.service.ts`: only the addressee can answer, a conditional PENDING→ACCEPTED/REJECTED update makes repeats a no-op, and the 150-connection limit is checked for both people. One person keeps one account across sign-in methods. Telegram attaches from Account → "Connect Telegram" (`link_` code; an empty duplicate Telegram account is folded in).
- **Impulses on the Circle graph** — every active incoming Need the person has not decided on is shown as a small comet travelling along the handshake path from the person asking to the centre (through the people in between), with the path highlighted and the asker's ring swelling at each launch. At most five are drawn, nearest ring first; with `prefers-reduced-motion` nothing moves and a steady gradient of beads points towards the centre. Selecting a person highlights their path without pulses while impulses keep running dimmed. An impulse ends when the person reports Participation or declines ("Not now" on the Need page, or dismissing the request in the feed — both use `notification.dismiss`), when the Need is closed, paused or reaches its amount, or when the notice expires (24 hours). Opening the Need alone does not end it: "seen" (`READ`) and "decided" are separate (`isPendingRequest` in `apps/web/src/hooks/useEvents.ts`). `@so/graph-3d` takes `impulses: { id, path }[]` (asker first, me last); the demo (`pnpm --filter @so/graph-3d demo`) shows three.
- **Offline saved copy** — the device keeps a bounded copy of the person's network in IndexedDB (`@so/gun-backup`: up to 600 people over 3 handshake levels, nicknames, and the contacts of direct connections that the server already showed them; contacts fill in as person pages are opened plus up to 15 people per 5-minute sync). Without a connection the home, People and person screens show the saved people grouped by handshake level with a banner ("No connection. Showing the copy saved on this device, …") and Retry; a direct connection opens their saved contact links; actions that need the server (new Need, Participation, confirming an acquaintance) are disabled with a hint. The screens refresh by themselves when the connection returns. "Offline" means `navigator.onLine === false` or a failed request confirmed by a failed `/health` probe — a single failed request or any HTTP error status does not switch the app. The copy is keyed by user id, wiped on sign-out, account deletion and sign-in as another user, and writes that started before a wipe are dropped. A network failure while renewing the session never signs the person out; only a 4xx answer to the refresh request does.
- **Service worker** (`apps/web/public/sw.js`, registered at start-up except in dev and inside the Telegram Mini App; iOS WKWebView has no service workers, so no offline shell there) — besides Web Push: the HTML shell is network-first with a 3.5 s timeout and falls back to the cached `/index.html` when the network fails, is slow or answers 5xx; hashed `/assets/*` and `/fonts/*` are cache-first (an HTML answer is never cached as a file). `/trpc`, `/api`, `/gun`, `/health`, videos, cross-origin, non-GET and range requests are never touched. After a deploy the new shell is stored only once its entry files are cached; files of the previous build are kept for open tabs, older ones are removed. Kill switch: replace `sw.js` with a worker that has no fetch handler, deletes the `so-*` caches and unregisters itself (`sw.js` is served with `max-age=0` and registered with `updateViaCache: 'none'`). Bump `VERSION` in `sw.js` when the cache layout changes.
- **What a Need is for** — the author may add a short description (up to 300 characters, plain text) when reporting a Need and edit it on the Need page while it is open. It is shown on the Need page, on the public `/sos/:id` page (hidden while the Need is paused by moderation) and as two lines in the request row of the feed. Push and Telegram texts stay fixed and never include it.
- **Received marks per cycle** — for a regular Need the author's "received" marks belong to the current 28-day cycle. At cycle close they are saved as history (`ObligationReceipt`) and cleared; the author sees "Previous cycles" under the participants list (cycle, dates, how many marked and the sum, names on expand). The history is private to the author; a missing mark means "not marked", nothing more. Profile participation facts count a Participation marked in any cycle once.
- **Repeat waves and special roles** — a one-time Need that is still short of its amount is announced to new people every 12 hours (`re-notify`); nobody is told twice. Needs of the Author / Developer roles and of admins are announced through the network at creation like any other when they have an amount. Local checks: `apps/api/scripts/check-renotify.ts` and `apps/api/scripts/check-receipts.ts` (each runs only against its own local check database).
- **One notification per event (SO-45)** — every external message goes through `services/delivery.service.ts`: the person's single channel (`User.notifyChannel`: app push OR Telegram; empty = app if the person has a push subscription/token, otherwise Telegram if linked) and a `NotificationDelivery` row with a unique `(userId, eventKey)` claimed before sending, so repeats, worker retries and races send nothing twice. `User.notifyNewCollections` switches off new collections only; requests, responses and collection updates always come. Responses to an author's collection are grouped (`response-digest` delayed job, 5-minute window, one job id per window; a timer without Redis) and skipped when the author already opened the collection (`Collection.creatorViewedAt`) or it is no longer active. Push texts are fixed (no names, amounts or contacts). The auto-chain and admin broadcasts no longer add a Web Push copy for people who got the message in Telegram. Settings → Notifications: channel and the new-collections switch. Migration `20261109120000_notification_channel` (apply manually before deploy). Local check: `scripts/check-notifications.ts`.
- **Confirmed connections count (SO-15)** — one definition everywhere: `Connection` rows the user is part of (either side of the pair); invite links and pending requests are not connections. `countConnections` in `connection-request.service.ts` feeds the SOS threshold (10 for a regular user, the form shows the same number from `connection.getCount`), the 150 limit and the account deletion scenario (connections or invitees → muted, otherwise deleted without traces; the Telegram "bot blocked" cleanup follows the same rule). Every new connection goes through `createConnectionWithinLimit`: both user rows are locked in id order and counted inside the transaction, so parallel confirmations at 149/150 can't exceed the limit and a repeat creates nothing; SOS links don't bypass the limit. There is no one-sided `connection.add`. Load fixes are covered by `scripts/check-load-fixes.ts` (graph append vs reload, reach cache, batched waves, uploaded photos; any local database). Local checks: `scripts/check-connection-counts.ts` (boundaries 0/9/10/149/150, parallel accepts, special roles, deletion, bot-blocked cleanup) and `scripts/check-connection-sources.ts` (e-mail code, Telegram and Google newcomers count the same).
- **Money MVP scope** — the app keeps connections, collections with intentions, contacts, and the notifications they need. Skills, needs, and matching are off (`apps/api/src/services/mvp-scope.ts`): no pages, `/matches`, `/skills`, and `/needs` redirect to `/`, and the API answers NOT_FOUND unless `FEATURE_SKILLS=true`. Stored rows stay in the database.

## Terminology (Glossary)

| Term | Description |
|------|-------------|
| **Handshake** | Mutual confirmation of an existing meaningful connection between two people |
| **Need** | One of the two signals: a participant's message about what they need (amount, one time or every 28 days, a chat link). The `Collection` record |
| **Participation** | The other signal: a participant's message about their own voluntary participation, with an amount they name. A voluntary intention, not a payment. The `Obligation` record |
| **Handshake chain** | Path of connections between two users through mutual acquaintances |
| **Connection count** | Number of first-level connections (handshakes) a user has |
| **Minimum participation of the network** | Sum of minimum participation of the people in the **visible rings 1–3** (what the person can check by eye). The headline counts the same visible people. The far rings (4th–5th) are only in the ring chips as a rounded count; the full reach is used by the request amount hint |
| **Minimum participation** | Amount a user is ready to give to one collection of someone they know (whole $, stored in `monthlyBudget`; not per month, never decremented). Prefilled when joining a collection |

## Redesign

The `redesign` branch replaces the old dashboard, network page, and planet landing with four tabs: Circle, Ask, Add, and Profile. Guests see the public site at `/` and the explainer at `/how`. Screen specs are in [docs/redesign/](docs/redesign/README.md).

The landing (`LandingPage.tsx`, `components/site/`) follows the author's copy: the hero, four steps, Principles, the path through acquaintances, what the tool does not do, and a short FAQ (the payments answer lives there, not in the hero). The hui table is only on `/how`, last, as a historical example. The hero is a dark scene panel with a live 3D network behind the copy (`components/site/heroGraph.ts`): about 90 fake people on depth shells around "You", drawn with Canvas 2D and its own perspective projection, so the landing does not load Three.js. It plays the app story in a loop (a Need on the far shell, a comet along the handshake path to you, a wave through the circle, shares coming back until the asker's ring is full). Drag rotates it, vertical swipes still scroll. It costs about 0.2 ms of script per frame, caps the pixel ratio at 1.5 (1 on slow devices or slow frames), stops off screen and in hidden tabs, and is a still frame under reduced motion. The ball position comes from CSS variables on `.site-hero` (`--hero-gx`, `--hero-gr`, `--hero-graph-h`).

Layout notes: on phones the live network scene opens the page above the title, so it is on the first screen with the store button. Under the buttons one line shows the real number of people in the network (`stats.public`); no collection figures are shown. "How it works" is one sticky figure whose step follows the scroll (`StepStory`). Blocks fade in as soon as any part of them is near the bottom of the screen. The language chip on the site, on sign-in, and in Profile opens one `LanguageSheet` (a bottom sheet on phones, a dialog on wide screens) instead of the native select. The Circle feed is split by meaning: Waiting for you (requests, acquaintance requests), Your Needs (own Needs and their status rows, a flag icon), You are in (Needs you take part in, a hand icon), People. On desktop the scene has zoom, Back to me, and an expand button that hides the feed column (Escape brings it back). People rows say how many people a person brought in (their connections besides you) and what they pledged this period (`remainingBudget`, the same money "Your network can help" sums); rings 2-3 keep the path through your acquaintance. On phones the collapsed Events pill can be pulled up: the feed rises with the finger and opens past a 40 px pull; a tap still opens it.

Demo mode, the video guides, and the retired-feature page are removed.

Apply these migrations by hand on production (they are already in `packages/db/prisma/migrations`):

- `20261109120000_ask_block_reason_invite_ttl`
- `20261109140000_connection_via_collection`
- `20261109160000_collection_moderation`
- `20261110120000_milestones_by_meaning`
- `20261111120000_load_fixes` (index `notifications(collectionId)`, table `user_avatars`; the code works without it, photos then stay as data URLs)
- inactivity-cleanup migration — being added in parallel; the folder name is not in this branch yet

## Current Status

- [x] **Phase 0:** Monorepo infrastructure
- [x] **Phase 1:** Backend (API) — tRPC routers, services, BullMQ workers
- [x] **Phase 2:** Web frontend (MVP) — all 11 pages, UI components, tRPC client, i18n
- [x] **Phase 3:** 3D and optimization — Three.js planet, clouds, graph, Gun.js backup, code splitting
- [x] **Phase 4:** Deploy and testing — Railway config, API serves web frontend, SPEC audit fixes
- [x] **Phase 5:** UX improvements — onboarding, handshake chain, contacts, tooltips, terminology
- [x] **Phase 6:** Visual polish — NASA textures, realistic stars, connection counts everywhere
- [x] **Phase 7:** Telegram Mini App — auto-auth, BackButton, haptics, theme sync, CSS variables
- [x] **Phase 8:** Native release — Capacitor iOS + Android wrappers; **live on the App Store and Google Play** (Sign in with Apple, native push on Android, invite referral on store links)
- [x] **Redesign:** Circle, Ask, Add, Profile, and the public landing. Route pages are lazy; the 3D graph loads with the Circle

## License

MIT
