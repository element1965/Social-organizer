# Architecture

Turborepo monorepo with pnpm workspaces.

```
Social organizer/
├── apps/
│   ├── api/             # @so/api: Fastify + tRPC + BullMQ
│   └── web/             # @so/web: React 19 + Vite + Tailwind + ui2, Capacitor
├── packages/
│   ├── shared/          # @so/shared: types, constants, currencies, validation
│   ├── db/              # @so/db: Prisma schema + migrations (PostgreSQL 17)
│   ├── i18n/            # @so/i18n: i18next (28 languages)
│   ├── gun-backup/      # @so/gun-backup: graph copy on device (IndexedDB + Gun.js)
│   ├── graph-3d/        # @so/graph-3d: 3D circle (NetworkGraph only)
│   └── tg-adapter/      # @so/tg-adapter: Telegram WebApp SDK adapter
├── turbo.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Tech Stack

- **Monorepo:** Turborepo + pnpm
- **Backend:** Fastify + tRPC + Prisma + PostgreSQL 17 + BullMQ + Redis
- **Frontend:** React 19 + Vite + Tailwind CSS + ui2
- **Mobile:** Capacitor wrappers for Android and iOS
- **3D:** Three.js + react-force-graph-3d for the Circle; Three.js alone for the guest landing's starling flock. Both load on demand
- **Backup:** Gun.js (IndexedDB)
- **i18n:** i18next (28 languages: en, ru, es, fr, de, pt, it, zh, ja, ko, ar, hi, tr, pl, uk, nl, sv, da, fi, no, cs, ro, th, vi, id, sr, be, he)

It is a single web build, runtime-detected across surfaces: a regular website, a Telegram Mini App, and native iOS / Android apps (Capacitor wrappers loading the production web URL). The native wrappers use the light canvas token as their fixed start-up background to match the light splash. The web loader paints the light or dark canvas as soon as it can read the effective theme.

## Database

- PostgreSQL 17 on host port 54329 with Compose
- Prisma ORM for migrations and client generation

`pnpm db:setup` uses `prisma db push` for local development. It builds
the schema from `schema.prisma` without creating migration history or
inserting the original deployment's FAQ rows. The historical migration
`20260207165421_add_faq_items` references an author who exists in production.
A separate replay issue affects `20260224_chain_broken_status`: it sorts
before the migration that creates `ChainStatus`. Databases built with
`db:setup` are for local use. Production continues to use the existing
migration files and `prisma migrate deploy` with no checksum or history
changes required.

Prisma's v6 documentation describes an edited migration as a checksum change.
Deploy can warn and continue, while `prisma migrate dev` can ask for a reset.
With this repository's Prisma 6.19.2, an isolated test of an edited applied
migration returned exit 0 from `migrate status`. `migrate deploy` then
applied a pending migration with exit 0.
See [Prisma's migration history documentation](https://www.prisma.io/docs/orm/v6/prisma-migrate/understanding-prisma-migrate/migration-histories)
and [deploy guidance](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/patching-and-hotfixing).

### Data models

The [Prisma schema](../packages/db/prisma/schema.prisma) defines 41 models.

| Model | Description |
|---|---|
| User | User with settings, role, onboarding flag, emailVerifiedAt (mailbox proven), preferredCurrency, monthlyBudget, remainingBudget, lastSeen, hideContacts, skillsCompleted |
| UserAvatar | A photo the person uploaded (bytes, mime, content hash). `User.photoUrl` then holds the short address `/api/avatar/<userId>/<hash>` instead of a data URL |
| PlatformAccount | Platform bindings (FB/TG/Apple/Google) |
| Connection | Connection between users (userAId < userBId) with optional nicknames (nicknameByA, nicknameByB) and `source`: how the two met in the app (personal link, live QR, shake, a Need page, a direct request, a suggestion, the bot; `CONNECTION_SOURCES` in `@so/shared`). The source is copied from the request (`PendingConnection.source`) and read by the admin funnel only |
| UserMilestone | A milestone reached by a user (FIRST_CONNECTION / NEED_UNLOCKED / FIRST_NEED / FIRST_PARTICIPATION; TEN_CONNECTIONS is kept in the enum for old rows only): recorded once per user with achievedAt, the person whose connection reached the first one, and seenAt for the one-time in-app confirmation. A historical fact — removing a connection or closing a Need later does not take it back |
| Collection | A Need: a participant's message about what they need (Emergency / Regular — a Regular one renews every 28 days; `EMERGENCY`/`REGULAR` in the DB) with amount in $ (originalAmount/originalCurrency are legacy, no longer written); optional `description` — legacy free text (up to 300 characters); no screen asks for it or shows it any more: people talk the situation over in the chat, outside the app |
| CollectionComplaint | A person’s report about a Need, with a reason and an optional comment. |
| CollectionReview | Review of a reported Need, with its deadline, outcome, and a snapshot of eligible voters. |
| CollectionReviewVote | An eligible person’s answer in a Need review. |
| Obligation | A Participation: a participant's message about their own voluntary participation in a Need, with amount in $ (originalAmount/originalCurrency are legacy, no longer written) |
| ObligationReceipt | The author's private "received" mark for one finished cycle of a regular Need (collectionId, userId, cycleNumber, amount, confirmedAt; unique per person and cycle). Written when the cycle closes; `obligationId` becomes null when the person's Participation is removed |
| Notification | Notification with handshake path |
| IgnoreEntry | Ignore record |
| EmailLoginCode | One-time e-mail sign-in code (HMAC only, 10 min TTL, attempts counter) |
| LinkingCode | 6-digit linking code (5 min TTL) |
| InviteLink | Invitation link |
| UserContact | User contacts (social networks, messengers) |
| ChatMessage | Chat conversation log (user message, assistant response, feedback flag, language) |
| PushSubscription | Web Push subscription (endpoint, keys, user FK) |
| NativePushToken | Native FCM push token for Android Capacitor app (token, platform, user FK) |
| PendingConnection | Acquaintance request with status, source, resolution time, and requester seen and dismissal marks. |
| LandingActionDay | UTC daily counts of landing visits and calls to action by campaign tags and referring hostname |
| UserSignupCampaign | First-touch campaign tags recorded when an account is created |
| InviteOpenDay | Guests who opened an invite page: a count per day and source. No person, link, address or device is stored |
| ScheduledPost | Scheduled broadcast post with status (PENDING/SENT/CANCELLED/FAILED), media, button |
| ScheduledPostDelivery | Individual delivery tracking per user per scheduled post with readAt for open stats |
| AutoChainMessage | Drip campaign message: text/media/button, dayOffset from registration, sortOrder, intervalMin |
| AutoChainDelivery | Delivery tracking per user per chain message with readAt for open stats |
| FaqItem | FAQ entry with question, answer, language, sort order, view count, group ID for translations, and a localization flag (admin-managed with LLM auto-translation). The app shows the requested language, then English, then an empty state |
| BotStart | Telegram bot start record with language, remembered invite, and reminder counters. |
| TranslationCache | Cached translated text keyed by the source hash and language. |
| SkillCategory | Skill/need category with key, group, sortOrder, isOnline (221 categories in 15 groups) |
| UserSkill | User's offered skill (link to SkillCategory) with optional note |
| UserNeed | User's need (link to SkillCategory) with optional note |
| SkillMatchNotification | Notification when a connected user's skill matches another's need (userId, matchUserId, categoryId) |
| SuggestedCategory | A suggested skill or need category, with its review status and resolved category if approved. |
| MatchChain | A proposed skills match chain, its state, and optional chat link. |
| MatchChainLink | An ordered giver–receiver link within a skills match chain, with category and offer details. |
| SupportMessage | Telegram support conversation entry with sender, text, and optional media. |
| NotifyStats | Per-person counters and timing used for Need notification routing. |
| NotificationDelivery | An external notification delivery claim keyed by user and event, with its channel. Keys under `need-notice:` are durable pending intents for Need requests and cycle notices: written in the same transaction as the in-app entry, leased one recipient at a time (10 min), retried up to 3 times, and replaced by the receipt only after the provider accepted the message. Pending, failed and retired intents never count toward the per-person limits, and the 60-day receipt pruning keeps them. |

## tRPC routers

The [router registry](../apps/api/src/routers/index.ts) mounts 22 routers.

| Router | Procedures |
|---|---|
| [shake](../apps/api/src/routers/shake.router.ts) | `register`, `status`, `respond` |
| [auth](../apps/api/src/routers/auth.router.ts) | `registerWithEmail` (retired, FORBIDDEN), `loginWithEmail`, `loginWithTelegram`, `loginWithGoogle`, `methods`, `requestEmailCode`, `verifyEmailCode`, `loginWithTelegramWidget`, `refresh`, `generateLinkCode`, `loginWithLinkCode`, `claimWithLinkCode` (retired, FORBIDDEN) |
| [user](../apps/api/src/routers/user.router.ts) | `me`, `update`, `getById`, `getStats`, `getContacts`, `updateContacts`, `completeOnboarding`, `setPreferredCurrency`, `setMonthlyBudget`, `inviteSlug`, `updateReferralSlug`, `checkRequiredInfo`, `delete` |
| [connection](../apps/api/src/routers/connection.router.ts) | `list`, `listForUser`, `suggestions`, `getCount`, `graphSlice`, `findPath`, `getNetworkStats`, `ringPeople`, `getNickname`, `setNickname`, `revoke`, `growthHistory` |
| [collection](../apps/api/src/routers/collection.router.ts) | `askAccess`, `block`, `unblock`, `removeJoiner`, `create`, `getById`, `updateAmount`, `updateChatLink`, `updateDescription`, `close`, `cancel`, `myActive`, `myParticipating`, `myHistory`, `getPublic` |
| [obligation](../apps/api/src/routers/obligation.router.ts) | `create`, `myList`, `updateAmount`, `confirmPayment`, `setPaid`, `receiptHistory`, `unsubscribe`, `unsubscribeFromCollection`, `confirmCycle` |
| [notification](../apps/api/src/routers/notification.router.ts) | `list`, `markRead`, `dismiss`, `dismissNeed`, `dismissAll`, `attention`, `unreadCount`, `pulse` |
| [settings](../apps/api/src/routers/settings.router.ts) | `get`, `updateLanguage`, `updateTheme`, `updateSound`, `updateVoiceGender`, `updateFontScale`, `updateHideContacts`, `updateNotifyRenewalReminder`, `updateNotifyCycles`, `updateNotifyRenewalStart`, `updateNotifyChannel`, `updateNotifyNewCollections`, `updateGeo`, `ignoreList`, `addIgnore`, `removeIgnore` |
| [invite](../apps/api/src/routers/invite.router.ts) | `generate`, `accept`, `acceptSos`, `opened`, `getByToken` |
| [stats](../apps/api/src/routers/stats.router.ts) | `public`, `byPeriod`, `profile`, `help`, `helpGivenByPeriod`, `platformGrowth`, `participationFacts`, `helpHistory`, `adminAllUsersStats`, `adminFunnel`, `networkFigure`, `networkCapabilities` |
| [currency](../apps/api/src/routers/currency.router.ts) | `list`, `detectCurrency`, `rates`, `convert`, `toUSD` |
| [chat](../apps/api/src/routers/chat.router.ts) | `send`, `speak` |
| [faq](../apps/api/src/routers/faq.router.ts) | `list`, `top`, `all`, `incrementView`, `isAdmin`, `create`, `update`, `delete`, `localizeAll`, `localize` |
| [push](../apps/api/src/routers/push.router.ts) | `vapidPublicKey`, `subscribe`, `unsubscribe`, `registerNativeToken`, `unregisterNativeToken` |
| [broadcast](../apps/api/src/routers/broadcast.router.ts) | `sendAll`, `sendDirect`, `schedulePost`, `listScheduled`, `cancelScheduled`, `scheduledStats`, `createChainMessage`, `listChainMessages`, `updateChainMessage`, `deleteChainMessage`, `chainStats`, `markRead` |
| [pending](../apps/api/src/routers/pending.router.ts) | `incoming`, `myPending`, `introStatus`, `acceptedRecent`, `markAcceptedSeen`, `dismissAccepted`, `incomingCount`, `accept`, `sendDirectRequest`, `directStatus`, `cancel`, `reject` |
| [cluster](../apps/api/src/routers/cluster.router.ts) | `list` |
| [skills](../apps/api/src/routers/skills.router.ts) | `categories`, `mine`, `forUser`, `saveSkills`, `saveNeeds`, `markCompleted`, `adminStats`, `matchHints`, `listSuggestions`, `updateSuggestion`, `approveSuggestion`, `rejectSuggestion` |
| [matches](../apps/api/src/routers/matches.router.ts) | `whoCanHelpMe`, `whoNeedsMyHelp`, `myChains`, `setOffer`, `confirmLink`, `completeLink`, `cancelChain`, `declineLink`, `setChatLink`, `matchNotifications`, `dismissMatchNotification`, `markMatchNotificationsRead`, `unreadMatchCount` |
| [support](../apps/api/src/routers/support.router.ts) | `listConversations`, `getMessages`, `sendReply` |
| [milestone](../apps/api/src/routers/milestone.router.ts) | `list`, `markSeen` |
| [moderation](../apps/api/src/routers/moderation.router.ts) | `canComplain`, `complain`, `vote`, `myOpenReviews`, `adminOpenReviews`, `adminClose` |

- `connection.getNetworkStats` returns exact counts and up to 1,000 people for rings 1–3, which also serve as the offline fallback. `connection.ringPeople` pages the full lists for these rings with up to 100 people per request. Ring membership and paths come from the graph in memory. Search or sorting by name, intention, or circle size queries the IDs for the ring.
- `connection.revoke` removes the connection and its request rows. `invite.opened` counts guest visits to an invite or public Need page.
- `notification.pulse` returns change counters and timestamps without writing. `stats.networkCapabilities` serves the network figure to older clients.
- `faq` provides localized entries, view ranking, and admin-managed translation across the 28 supported languages.
- `skills` and `matches` are disabled by default. Their procedures return `NOT_FOUND` with `FEATURE_DISABLED` unless `FEATURE_SKILLS=true`.

## Services

- **Auth** — JWT (HS256), 30 min access / 30 days refresh (both carry `iatMs`; a token issued before the account's first mailbox proof is refused, see [operations](operations.md#security-architecture)), 6-digit linking codes (spent atomically before any write), Telegram initData HMAC-SHA256 validation, Google & Sign in with Apple via system-browser OAuth (Apple id_token verified against Apple JWKS, no client secret) — see [Sign in with Apple](../APPLE_SIGNIN.md). In the native app the result comes back through `socialorganizer://auth-success` on iOS (Safari cannot open `intent://`) and an `intent://` link on Android, which also closes the Custom Tab: `apps/web/src/lib/nativeReturn.ts` for Google (the OAuth state carries the platform), `appleRedirect` in `apps/api/src/index.ts` for Apple. If the browser stays on the page, it shows an "Open the app" button with the same link
- **BFS** — In-memory walk over the handshake graph for network counts, path finding and notification distribution. The graph is kept in process memory as numbers (`graph-store.ts`): people are numbered, and every person's neighbours sit in flat typed arrays, so 100,000 people and 643,000 connections take about 20 MB of arrays instead of 290 MB of objects and a walk to the 6th handshake takes 10–15 ms instead of 400–750 ms. New connections go to a small overflow next to the arrays, removed ones leave a hole, and the arrays are rebuilt when overflow and holes pass a fifth of the graph; a person's number never changes. `graph-cache.service.ts` loads it in chunks and keeps it up to date without reading the table again: code that changes connections or accounts names the people it touched (`invalidateGraph(ids)`) and only their rows are re-read (a removed connection, a deleted or restored account, a new connection); connections added by another process are appended from the newest rows; the whole table is read again only when neither adds up to it. Whether anything changed is answered by a signature: every 5 seconds at most a light one (newest connection and number of deleted accounts, both from indexes), and the exact one with the count of all connections only after a change and once a minute. A request never reads the whole connections table, and how many connections a person has (lists of people, the Circle graph, the path) is read from the graph, not counted in the database. Walk results keep only a parent link per person and build the handshake path when it is read, so a wave over a large network does not hold an array per reached person. A request wave walks the graph one handshake ring at a time (`walkRings`) and asks for the next ring only while its budget lasts, so its cost follows the amount of the Need, not the size of the network (in a synthetic network of 1,000,000 people: 0.2 ms to find the 300 nearest against about 1 s for the full walk to the 6th handshake)
- **Far rings** — The 4th to 6th handshakes are shown only as one rounded count (the far chip "4th–6th: ~400", `roundFarCount` over the three rings together) and an anonymous dust of dots around the 3D graph. The same single projection is what the network figure adds for them, so no two shown numbers differ by an exact far count. Names, links and exact numbers of people beyond the 3rd ring never leave the server, with one explicit exception: the unlock gate is decided on the exact count, so `allowed` (and the gate's `networkMet`) can reveal one bit about a small far count, for example "locked" with 8 people in rings 1–3 and "a few" beyond means exactly one person there. The gate stays exact on purpose; the same bit can also show as the chip moving from "a few" to "~10" after one known addition (4 → 5).
- **Runtime metrics** — `runtime-metrics.service.ts` writes one line a minute to the log (`[metrics] …`): event loop delay (p50, p95, max), requests in the last minute, memory, the graph (people, connections, full reloads and the time of the last one, re-reads, appends, light checks, the exact signature time) and how long network walks took (`reach`: the count up to the 6th handshake; `wave`: choosing who a Need notifies). A full reload after start-up is logged on its own (`[graph] full reload …`). Numbers only. The scale steps in [docs/release/launch-readiness.md](release/launch-readiness.md#6-scale-steps) name the thresholds these lines are watched for.
- **Notifications** — BFS distribution with 1:1 ratio (amount = notification count), ignore list, handshake path, Telegram bot and Web Push notifications. Requests go out in waves, nearest first, up to the 6th handshake: wave 1 on creation, then every 12 hours to the next people not yet notified (people already notified are passed through, so each wave reaches further). A ring is read in chunks of 500 people and only as far as the wave gets (`HOLD_CHUNK`). Within a ring, people whose budget is used up, who had 2 requests today or 6 this week, who ignored 5 in a row (one probe after 14 days) or whom no channel reaches outside the app get only the in-app entry and do not spend the wave; see [docs/notifications/behaviour-routing.md](notifications/behaviour-routing.md)
- **Network figures** — "People in the network" and "Declared participation of the network" are one figure on every screen (Circle, Profile, My intention, the Need screen's amount hint and "N people can see it", the bot's invite message): everyone up to the 6th handshake (`NETWORK_MAX_DEPTH`, the same depth a Need's waves reach and the request gate counts), without the person themselves, and the sum of what they can still give (`networkReach` in `network.service.ts`, counted by `network-figure.ts`, made public only through `publicFigure`). People: rings 1–3 exactly plus the far chip, so the Circle header is always 1st + 2nd + 3rd + the far chip ("a few" adds nothing). Sum: exact, the same number the Need screen showed before. The four screens (and the offline home) read it from one light endpoint, `stats.networkFigure` (`people`, `canHelp`, `rings`, `far`), through one hook with one key per account and one set of options (`hooks/useNetworkFigure.ts`). What it touches in the database: like every signed-in call, the auth check reads the account (`deletedAt`) and the activity heartbeat writes `lastSeen` at most once a minute per person (fire-and-forget); a kept answer is then served from memory with nothing more; on a miss the walk first brings the graph up to date and the budgets. Usually that is the light signature (newest connection and number of deleted accounts, from indexes, every 5 seconds at most), re-reading only the rows that changed, and the budget rows changed since the last minute. Less often it is more: the exact signature, with a `COUNT(*)` over all connections, runs after an invalidation and once a minute; when neither the appended rows nor the re-read people add up to it, the whole connections table is loaded again in chunks (a full graph load); and every 30 minutes all budgets are read again. Whichever request comes first pays for these; the walk itself reads nothing. It never counts connections or reads people one by one. The query names the account it is for (`{ account }`; `connection.getNetworkStats` and `collection.askAccess` do the same), and the server refuses an answer for another session, so after switching accounts in place no answer is shown or saved under the wrong one. A switch made in another tab reaches this one through the `storage` event (and through an `ACCOUNT_CHANGED` answer, which is never retried and never shown as an error): the tab re-reads the stored session and the queries re-key. The Need tab's ring is shown only for the account its value belongs to, quiet until that account's gate answers. While there is no figure (loading, nothing live or saved) the Circle header shows a placeholder, never 0. The hook keeps the person's last figure in localStorage (a version, the account, the time the server answered, every field checked before it is shown or saved; removed on sign-out and when someone else signs in) and shows it before the first answer, after a failed fetch and offline. Everything that makes or removes a connection refreshes it at once (`lib/refreshNetwork.ts`: confirm or decline a request, the live QR, a scan, shake, an invite link, a public Need link, a suggestion or direct request answered at once, removing a person or a joiner), and so does the pulse when it reports a change in the person's own connections (a request confirmed in the bot or on another device). The figure decides its own zeros: a person with no connection yet gets 0 from the server; the network they asked to join comes only as `getNetworkStats.preview`. `collection.askAccess` is read only by the Need tab, its "path to a Need" sheet, the tab ring and the Circle's "N of 5" strip; when `allowed` is true (also for authors, developers and admins with unmet thresholds) the sheet shows the open state, the ring is full and the strip is hidden, never incomplete steps. Otherwise the unlock thresholds are decided on the exact counts (`allowed`, `directMet`, `networkMet`) and the progress shows completion from those flags, never a network number at or above the goal while `networkMet` is false; its `networkCount`/`networkCanHelp` are the same figure (the same server function). `stats.networkCapabilities` (`total`, `people`) stays for older app versions. The walk is kept per person: up to 5 minutes while the graph is unchanged, up to 1 minute after a change somewhere else, and dropped at once for the two people of a new or removed connection, so their own change shows on the next request. After that minute only the visible rings 1–3 are walked again and the far rings 4–6 are reused for up to an hour (only in networks whose far part is 500 people or more: in a small network every cache miss walks all six rings), unless the people of rings 1–3 who were already in the graph at the full walk are not exactly the same: their numbers are kept beside the far part and checked one by one (`measureNear`), and on any difference the whole reach is walked again on the same graph and budgets, so nobody is counted in both parts or in neither. People added to the graph since the full walk cannot be in the kept far part and never force a full walk. The kept numbers cost 4 bytes per person in rings 1–3 per kept answer; a person with more than 50,000 there keeps none (no reuse, a full walk when stale, at most once a minute), and all kept answers together hold at most 4,000,000 numbers (16 MB): past it the oldest answers lose only their list and stay kept, so they are still served while fresh and are walked in full when stale (`ReachKeeper`; a round of thousands of people asking in turn keeps being answered from memory). What the reuse can still miss for up to an hour is change inside rings 4–6 only: people joining or leaving them there, accounts deleted there and changed budgets there; the people count absorbs it within its rounding (steps of 50 or more at 500+ people), the sum can be off by those budgets. Measured without a database (`apps/api/scripts/check-graph-store.ts`, synthetic networks with about 6.4 connections per person, mostly local): 100,000 people and 640,000 connections, a walk to the 6th handshake 5.3 ms, with the list of rings 1–3 kept 5.3–6.3 ms, rings 1–3 again with the exact check 0.09 ms; 1,000,000 people and 6.4 million connections (`BENCH_PEOPLE=1000000`), 31 ms, 30 ms and 0.09 ms. What people can give is kept in memory beside the graph (an array by person number): read in full once, then updated from the rows that changed every minute, at once for the people of a new connection and for a person who changed their own amount, and in full again every 30 minutes. A sum over a reach is a loop over that array, with no query per walk
- **Telegram Bot** — Collection notifications (new, blocked, closed) via Bot API with rate-limited broadcast (25 msg/sec batches via BullMQ). Messages are queued in jobs of 250 (`TG_JOB_SIZE`) with a priority: a Need's wave goes before a mailing to everyone (`TG_PRIORITY`), so it waits for the current chunk of a mailing at most, about ten seconds, instead of the whole mailing
- **Web Push** — Browser push notifications via web-push library with VAPID, auto-cleanup of expired subscriptions
- **FCM Push** — Native Android push notifications via Firebase Cloud Messaging (firebase-admin), auto-cleanup of expired tokens
- **Milestones** — `milestone.service.ts`: a record of what actually changed for a person. FIRST_CONNECTION (first confirmed connection), NEED_UNLOCKED (the Need tab thresholds are met: `ASK_MIN_DIRECT` direct connections and `ASK_MIN_NETWORK` people in the network), FIRST_NEED, FIRST_PARTICIPATION (in somebody else's Need). Only stored rows count (invite links and pending requests never do); synced right after a new connection, a new Need and a new Participation, and on `milestone.list`, where facts older than a day are stored as seen. Unique per user, no push, no rating, no milestones for amounts or headcount. UI: a reached milestone shows once in the Circle feed with a short sheet (only the person sees it). Profile has no Milestones row (removed 12 Nov 2026). Migration `20261110120000_milestones_by_meaning` (apply manually before deploy)
- **Currency** — Exchange rates service is kept but not used for amounts: intentions, capacity and goals are entered in $ only (1 $ = 1 unit of participation, SO-40)
- **Geo** — IP-based country detection for currency auto-selection (ip-api.com)

## BullMQ Workers

| Worker | Description | Schedule |
|--------|-------------|----------|
| `cycle-close` | Auto-close 28-day cycle for regular collections + emit `CYCLE_RENEWED` to active subscribers; moves the author's "received" marks of the ended cycle into `ObligationReceipt` and clears them, so the new cycle starts unmarked | Every hour |
| `re-notify` | Repeat waves for Emergency Needs: once the previous wave is 12 hours old and the Need is active and short of its amount, people who were never told about it get an entry (continues along the graph). Regular Needs are announced once. A wave that finds nobody new leaves a marker (`notification_deliveries`, key `renotify:<collectionId>:<ms>`) so the Need rests for another 12 hours | Every hour (12-hour gate per Need) |
| Need notice drain | Sends pending `need-notice:` intents (Need requests, cycle start, reminder and closure notices) after restarts or provider failures. Each handoff rechecks the Need (open, below its goal), the recipient's current channel and both ignore directions. With Redis it runs with the hourly workers; without Redis the API drains at start and every minute | Hourly (Redis) / every minute (direct) |
| `special-notify` | People who already reported Participation somewhere hear once, in the app only, about active Needs of the Author / Developer roles | Every hour |
| `cycle-renewal-reminder` | Send `CYCLE_RENEWAL_REMINDER` to subscribers 3 days before next cycle (in-app + TG + push) | Every hour |
| `expire-notifications` | Expired notifications (24h) → EXPIRED; old ones are deleted after 7 days, except request entries of a Need that is still open (they are the record of who was already told) | Every hour |
| `check-block` | Check intention sum → BLOCKED | On event |
| `tg-broadcast` | Send Telegram bot messages in rate-limited batches (25/sec) | On event |
| `scheduled-post` | Send scheduled broadcast posts at their planned time | Every minute |
| `auto-chain` | Drip campaign: send chain messages based on user registration date + day offset. Skills reminders (sortOrder ≥ 100) and messages whose button leads to `/matches`, `/skills`, `/needs` are skipped in the MVP; scheduled posts with such a button are cancelled | Every 30 min |
| `cleanup-blocked-pending` | Remove users who blocked the bot from pending connections via TG getChat API | Every hour |
| `inactive-account-cleanup` | Accounts with no authenticated activity for 2 years (`lastSeen`, else `createdAt`; admins, AUTHOR/DEVELOPER and deleted users excluded) get notices 30 and 7 days ahead (Telegram, push, e-mail; stage in `users.inactivityStage`), then are deleted with the same logic as `user.delete` (`services/account-deletion.service.ts`). Any activity (authenticated request, sign-in/refresh/link code, bot interaction — `services/activity.service.ts` `touchUser`) resets the stage. Deletion always comes ≥ 7 days after the second notice; undelivered notices do not block it (counted in the log). Also exempt: `CLUSTER_ROOT_OVERRIDE` accounts and authors of an ACTIVE/BLOCKED collection with another person's pledge. Max 300 users per stage per run. Without Redis it runs on an in-process timer (first run 5 min after start, then every 24 h); a Postgres advisory lock keeps it to one run at a time. Check: `pnpm --filter @so/api exec tsx scripts/check-inactive-cleanup.ts` (local DB only) | Daily |
