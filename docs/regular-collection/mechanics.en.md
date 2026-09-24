# Regular collection and QR code: how it works today

This document is based only on the repository code (branch `main`, commit `3924fe4`). File paths are given
so that every statement can be checked. Next to it are the video instructions
`apps/web/public/videos/regular-collection/<locale>.mp4` (one per app language), recorded on a local copy of the app.
In the app they open from the play button next to the "Regular" type on the create screen and next to the QR block
of a regular collection (`apps/web/src/components/RegularCollectionVideo.tsx`).

## In short: what to tell Michel

1. Create a Telegram group in advance and copy its invite link.
2. In the app: "SOS / Create" → type **"Regular"** → amount **7000**, currency **USD** → paste the chat link.
3. Tap **"Notify"** and confirm the two warnings. The alert goes out **once**: to people in your network
   along the handshake chain, starting with the closest ones, no more than 7000 people ($1 of the goal = 1 person).
4. On the collection page tap the **QR** icon (or "Share SOS link" to copy the same link as text).
   Put the QR code or the link on the website.
5. A person scans the QR → sees the collection page → "Join & Help" → Telegram opens, sign-in
   happens by itself → they **immediately become your direct contact (1st handshake)** and see the collection.
6. They enter a monthly amount and tap "Confirm". After that the link to your chat opens for them.
   The community gathers in that chat.
7. Every 28 days the cycle renews by itself. Intentions carry over to the new cycle until the person opts out.

Answer to Andrey's question "is it intended that a regular collection gets a QR code?": **yes**. The "Share
SOS link" button and the QR are shown to the owner of any active collection, emergency and regular alike
(`apps/web/src/pages/CollectionPage.tsx`, block `isOwner && (ACTIVE || BLOCKED)`, around lines 360–392).
The scheme Andrey described (the link leads straight to the collection and right into the author's 1st circle) is
**mostly implemented already**. The differences are listed at the end of the document.

---

## 1. Creating a regular collection

UI: `apps/web/src/pages/CreateCollectionPage.tsx`. API: `collection.create` in `apps/api/src/routers/collection.router.ts`.

| Field | What it is | Where in code |
|---|---|---|
| Type | `EMERGENCY` or `REGULAR` | `type` in `collection.create` |
| Amount | The goal, minimum 10. Converted to USD and stored in USD; the original amount and currency are saved separately (`originalAmount`/`originalCurrency`) | `MIN_COLLECTION_AMOUNT = 10` in `packages/shared/src/constants.ts` |
| Currency | Any currency from the list. The rate comes from `currency.service` | `convertToUSD` |
| Chat link | Required, any URL (Telegram group, personal profile, another messenger). Below the field there is a hint "How to create a Telegram chat?" | `chatLink: z.string().url()` |
| Period | **Not selectable.** A regular collection always has a 28-day cycle | `REGULAR_CYCLE_DAYS = 28` |
| Description / purpose | **There is no such field** | `Collection` model in `packages/db/prisma/schema.prisma` |

Restrictions on creation (`collection.router.ts`, `create`):
- A regular user must have **at least 10 accepted invitations** (`MIN_CONNECTIONS_TO_CREATE = 10`).
  Only people who came through their invite links (`inviteLink.usedById`) count; direct friend requests
  do not. Otherwise a "Not enough connections" dialog appears.
- Only **one regular and one emergency** collection can be open at the same time.
- If the amount is above $10,000, an extra checkbox "I confirm the amount is correct" is required.
- Before creation two dialogs are shown: "This is a real help signal" and "Confirm collection creation"
  with the checkbox "I've thought it through and confirm". Their text is written for an emergency collection, but they are shown for both types.

## 2. What "Notify" does

There is no separate "alert" button after creation. The **"Notify"** button creates the collection and in the same request
sends out the alert (`sendCollectionNotifications` in `apps/api/src/services/notification.service.ts`).

- **To whom:** a breadth-first traversal of the handshake graph from the author (`findRecipientsViaBfs`, `apps/api/src/services/bfs.service.ts`).
  First the 1st circle, then the 2nd and further, up to 6 handshakes deep (the default).
  People on the author's ignore list and those who already received an alert for this collection are skipped.
- **How many:** $1 of the goal = 1 person (`NOTIFICATION_RATIO = 1`). A $7000 goal means an alert to up to ~7000
  people, but no more than there are in the network. The form shows in advance how many people that will be:
  "Your signal will reach up to N people through handshake chains".
- **Channels:** an in-app notification with the handshake chain to the author, a Telegram bot message with a button
  that opens the collection page (`dispatchNewCollectionTg`, sent through a queue at 25 messages per second),
  plus web push and push to the Android app.
- **How often:** **once.** The re-notification worker (`apps/api/src/workers/re-notify.worker.ts`) exists in the code,
  but it is not added to the queue schedule (`apps/api/src/workers/index.ts`), so there are no repeat waves.
  In-app notifications expire after 24 hours (`NOTIFICATION_TTL_HOURS`).
  A new wave goes out only if the author **raises the goal** on the collection page (`collection.updateAmount`):
  additional people receive the alert for the difference.
- **Special roles:** if the author has the `AUTHOR`/`DEVELOPER` role or is an admin, the 10-invitations rule does not
  apply to them, but the alert on creation is **not sent either** (`isSpecial` in `collection.create`).
  Such collections were supposed to be sent out by the `special-notify.worker.ts` worker, but it is not in the schedule either.

Checked on a local copy: an author network of 12 people in the 1st circle and 36 in the 2nd, goal $7000.
48 `NEW_COLLECTION` notifications were created, i.e. everyone reachable received one.

## 3. The QR code and the link: what they contain and where they lead

- The QR and the "Share SOS link" button carry **the same** link:
  `https://www.orginizer.com/sos/<collection id>` (`buildSosInviteUrl`, `apps/web/src/lib/inviteUrl.ts`).
  It is a link **to a specific collection**, not the author's personal invite link.
- `/sos/:id` is a public page without sign-in (`apps/web/src/pages/SosLandingPage.tsx`, data from `collection.getPublic`):
  the author's name and photo, "needs support", collected / goal, the number of participants and a single button
  **"Join & Help"**.
- The button leads to the Telegram Mini App: `https://t.me/socialorganizer_bot?startapp=sos_<id>`.
  The Mini App signs in by itself with Telegram data (`auth.loginWithTelegram`) and opens
  `/collection/<id>?sos=true` (`apps/web/src/components/TelegramBootstrap.tsx`).
  If the person came through the bot with the `/start sos_<id>` command, the bot replies with a button to the same address
  (`apps/api/src/services/telegram-bot.service.ts`).
- The QR is shown only on screen; there is no separate "download PNG" button. To put the QR on a website,
  you have to take a screenshot or generate a QR from the copied link.

## 4. What happens to the person who scanned the QR

1. **Registration.** This is a Telegram sign-in: a new user is created automatically, no profile form
   is needed, and the collection page opens without onboarding.
2. **Getting into the author's 1st circle.** The collection page with `?sos=true` calls `invite.acceptSos` by itself
   (`CollectionPage.tsx` → `apps/api/src/routers/invite.router.ts`). A **direct connection with the author is created immediately,
   without confirmation**. Pending mutual requests are closed as accepted. The author receives the message
   "so-and-so accepted", and skill matches are recalculated for both. On the local copy the author's connection count
   grew from 12 to 13, and the new person appeared in "Network → 1st handshake".
3. **Joining the collection is not automatic.** The person sees the "Participate" form: amount (1 by default), currency,
   "Confirm". The intention is created only after the tap (`obligation.create`).
   If they came through an SOS link and have not set their budget yet, this amount is also saved as their "monthly capacity".
4. **Access to the chat.** The "Open chat" link is shown **only to the author and to those who have already entered an intention**
   (`CollectionPage.tsx`, condition `hasObligation || isOwner`). Before that the chat is not visible.
5. The "Participate" form exists only while the collection status is `ACTIVE`. If the sum of intentions reaches the goal, the collection
   switches to `BLOCKED`: new people coming via the QR still become the author's connections, but can no longer sign up
   until the next cycle starts.

## 5. How regular "payments" are recorded

- The app **does not move money**. An intention (`Obligation`) is a promise: an amount in USD plus the original currency.
  Participants make the transfers themselves, arranging them in the chat.
- The author can mark that a payment was received: a checkbox next to the participant (`obligation.confirmPayment` → `confirmedAt`).
- **28-day cycle** (`apps/api/src/workers/cycle-close.worker.ts`, runs every hour). When a cycle ends,
  a new one starts: `cycleNumber + 1`, status back to `ACTIVE`. Participants receive a cycle-closed notification
  and "cycle renewed" (in the app and in Telegram). Only the intentions of those who unsubscribed are deleted.
  Everyone else **carries over to the new cycle automatically**. "Collected" is the sum of the active monthly intentions.
- 3 days before a new cycle participants receive a reminder (`cycle-renewal-reminder.worker.ts`); it can
  be turned off in the settings.
- One can unsubscribe from the renewal notification (`obligation.unsubscribeFromCollection`, `NotificationsPage.tsx`).
- The author can change the goal or the chat link at any time, and close the collection (participants receive a closure notification).

## 6. Where reality differs from Andrey's scheme

| Andrey's expectation | How it is now | Status |
|---|---|---|
| The link from a regular collection leads straight to that collection | The QR and the link lead to `/sos/<id>`, then via Telegram to the collection page | Yes |
| The person who scans automatically joins the author's 1st circle | Yes, a direct connection without confirmation (`acceptSos`) | Yes, but only via Telegram |
| Works for anyone | From the public page you can go **only to Telegram**. Without Telegram (a regular browser, the iOS/Android apps) the "QR → connection with the author" path does not work. There is no path for iOS and Android that would lead to `sos` | No |
| The person "subscribes" to the collection | Not automatic: they need to enter an amount and tap "Confirm" | Partly |
| Then goes to the chat | The chat link is visible only after an intention | Yes, with this condition |
| "A community forms" | Each new person connects only to the author; newcomers do not connect with each other. Communication happens in the external chat | By design |
| "Alert everyone once" | Yes, once on creation. No repeat waves unless the goal is raised | Yes |
| Michel does not have his own network yet | Creating a collection needs 10 accepted invitations. Granting the AUTHOR/DEVELOPER role lifts the restriction, but **the alert on creation will not be sent at all** | Needs a decision |
| A collection description for website visitors | There is no "description / purpose" field. The public page shows the name, "needs support", the goal and progress | No |
| Put the QR on the website | The QR exists only on screen; it cannot be downloaded with a button | No |
| An English interface for Michel | The caption under the QR ("Scan to join") and the "QR code" tooltip were hardcoded in Russian (visible in every language version of the video); now fixed — i18n keys `collection.qrScanHint` / `collection.qrTitle`. The button is called "SOS link" for a regular collection too. The creation warnings are written for an emergency | Cosmetic |
| Monthly payment tracking | The "paid" mark (`confirmedAt`) is not reset on a new cycle. There is no per-cycle payment history | No |

## 7. How the videos were recorded

`apps/web/public/videos/regular-collection/<locale>.mp4` are vertical 720×1280 videos, about 1.5 minutes each, one per app
language (`packages/i18n/locales`: ar, be, cs, da, de, en, es, fi, fr, he, hi, id, it, ja, ko, nl, no, pl, pt, ro,
ru, sr, sv, th, tr, uk, vi, zh). The app UI is shown in that language (switched the way the app does it: the
`language` key in localStorage, see `apps/web/src/lib/i18n.ts`), and the captions are in the same language
(`captions.mjs`; button names in the captions are taken from the app's own i18n strings).
Recorded with Playwright on a **local** copy: a separate `so_video_demo` database on local Postgres, the API without
a Telegram bot token and without Redis, so no external messages were sent. The data is demo data:
"Collection Author" (localized), 12 people in the 1st circle, 36 in the 2nd, "Anna (new member)" (localized).
The step "the person tapped the button in Telegram" is shown like this: after the public page `/sos/<id>` the recording opens
the same address the Mini App opens (`/collection/<id>?sos=true`), already as the new user.
Telegram itself is not shown.

All 28 language versions are committed under `apps/web/public/videos/regular-collection/` and served by the web app
as static files (the app picks the file by the current UI language, falling back to `en`).

To record again:
1. `DATABASE_URL=…/so_video_demo` → `prisma db push` in `packages/db`
   (`seed-demo.mjs` refuses to work with any database other than the local `so_video_demo`; the recorder re-seeds it per language).
2. API: `JWT_SECRET=local-video-demo WEB_APP_URL=http://localhost:3000 PORT=3001 npx tsx src/index.ts`
   (without `REDIS_URL` and `TELEGRAM_BOT_TOKEN`).
3. Web: `VITE_WEB_APP_URL=http://localhost:3000 VITE_TELEGRAM_BOT_USERNAME=socialorganizer_bot npx vite --port 3000`.
4. `DATABASE_URL=…/so_video_demo PLAYWRIGHT_PATH=<path to playwright/index.js> node docs/regular-collection/shoot-video.mjs en de …`
   (or `all`; with no arguments it records `ru`).
