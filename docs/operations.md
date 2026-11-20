# Deployment, security and recovery

## Deployment

- **Railway:** Auto-deploy on `git push` to main
- **URL:** https://www.orginizer.com
- **Healthcheck:** /health
- **Services:** PostgreSQL 17, Redis 7, Fastify API
- **Migrations:** Railway does not run them; apply them by hand before deploying code that needs them. First set `DATABASE_URL` to the production database's public URL from the Railway variables: export it in your shell. An exported variable wins over `packages/db/.env`. Then run `cd packages/db && npx prisma migrate deploy`.
- **GitHub:** https://github.com/element1965/Social-organizer
- **Lambertain auto-delivery:** commits titled "Lambertain auto-delivery" (author `info@lambertain.agency`) are pushed straight to `main` by [Lambertain](https://www.lambertain.site/), the company of contributor Nikita Solovey. They deploy to production like any other push. After the history rewrite of 20.11.2026 the delivery runs only from a fresh clone, by fast-forward, never with a force push.

The API serves the site icons, web manifest and robots.txt from the built web files. The sitemap lists the six public pages and their language alternatives. Invite and public Need pages send `X-Robots-Tag: noindex` and use the site link-preview image when the person has no photo.

The production operator applies [the landing campaign migration](../packages/db/prisma/migrations/20261119120000_landing_campaign/migration.sql) before deploying the landing changes. It adds daily counters and optional signup attribution.

### Landing campaign counters

The first-party counter groups views and calls to action by UTC day, `utm_source`, `utm_medium`, `utm_campaign` and referring hostname. The counter stores aggregate counts without cookies, visitor identifiers, IP addresses or referring paths. It uses no banner. Use campaign slugs of up to 64 ASCII letters, digits, hyphens or underscores, starting with a letter or digit. Keep personal data out of campaign tags.

The device keeps the first tagged visit for up to 30 days. At registration, the tags are saved with the new account. Google Play can carry the tags into a new installation with the updated Android wrapper. App Store installs and transitions into a separate Telegram browser may lose the tags.

### Site icons

Run `node scripts/generate-site-icons.mjs` from the repository root after installing dependencies. It renders the `BrandMark` tile from `apps/web/public/logo.png` for the web, Android and iOS, and the Google Play icon. The generator also writes the native splash images on the light boot canvas, the transparent push badge, and the link preview with bundled Manrope. The iOS release script runs this same generator.

### Railway service config (Infrastructure as Code)

The API service settings live in `.railway/railway.ts` (Railway IaC): Nixpacks build `pnpm install && pnpm db:generate && pnpm build && cp -r apps/web/dist apps/api/dist/public`, start `node apps/api/dist/index.js`, healthcheck `/health`, restart on failure (10 retries), domain `www.orginizer.com:3001` and the `/app/gun-data` volume. It replaces `railway.json` (Config as Code), which Railway stops reading on 2026-12-01.

- **Railway does not read `.railway/` on deploy.** Settings reach the service only through the CLI: `railway config plan` (read-only diff against the linked environment), then `railway config apply`. Editing the file and pushing changes nothing on Railway.
- **Partial:** the file exports `partial = "Social-organizer"` and declares only the API service and its volume, so PostgreSQL, Redis and db-backup are never touched by an apply. Variables are unmanaged (`variables: { managed: false }`): secrets stay in Railway.
- **SDK:** the root dev dependency `railway` (pinned) is needed to evaluate the file. On Windows the SDK cannot find `railway.cmd`; point it at the binary: `_="$APPDATA/npm/node_modules/@railway/cli/bin/railway.exe" "$APPDATA/npm/node_modules/@railway/cli/bin/railway.exe" config plan` (Git Bash).
- **Switch-over order:** `railway config apply` first (it writes the same settings `railway.json` carries into the service), then delete `railway.json`. Deleting it before the apply would make deploys fall back to the dashboard defaults (Railpack, `pnpm install && pnpm build`), which skip Prisma generate and the web copy into `apps/api/dist/public`.

### Staging

The old Railway redesign staging environment was deleted. Use the [local quick start](../README.md#quick-start) for development. The Android staging build remains available for a separately configured test deployment.

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
- **Upload:** From the repository root, run [the Android release script](../scripts/deploy-android.mjs) with `node scripts/deploy-android.mjs --track internal` (or `alpha`, `beta`, `production`). It builds the web app, syncs Capacitor, builds the signed bundle and uploads it to Google Play. Set `GOOGLE_PLAY_SERVICE_ACCOUNT` to the service account JSON or provide the ignored credentials file described in the script.

#### Staging test app (on a real phone)

The `staging` build type wraps a configured test deployment. It is debug-signed, has its own package `com.socialorganizer.app.staging` and the name **SO Staging**, so it installs next to the Google Play app.

```bash
# Phone connected over USB with USB debugging on
node scripts/build-android-staging.mjs --url https://your-test-host.example
node scripts/build-android-staging.mjs --url https://your-test-host.example --no-web
```

- Pass your test deployment with `--url`. Gradle derives the host from that URL and writes an overriding `capacitor.config.json` into the staging assets.
- `src/staging/google-services.json` is the production Firebase config with the staging package name, so the build passes. Native push for staging needs the package registered as its own Android app in Firebase, plus a push key for that test backend.
- Sign in with the sign-in method configured for your test deployment. Google and Apple sign-in return through the `socialorganizer://` scheme, which the store app also registers, so Android may ask which app should open it.

#### App Links (invite QR opens the app)

`https://<host>/invite/<token>`, `/i/<id>` (personal address) and `/sos/<id>` (public Need) links (the live QR, shared invites and Needs) open the installed app instead of the browser: a phone camera or Google Lens offers the app, and the app routes the link to its invite page (`appLinkPath` in `App.tsx`).

- **Manifest:** an `autoVerify` intent-filter for `/invite/`, `/i/` and `/sos/` (store build from versionCode 15); hosts come from `manifestPlaceholders` in `app/build.gradle` (release: `www.orginizer.com` and `orginizer.com`, staging build: the staging domain).
- **Verification file:** the API serves `/.well-known/assetlinks.json` from env `ANDROID_CERT_SHA256` (comma-separated SHA-256 signing-cert fingerprints) and `ANDROID_APP_PACKAGE` (default `com.socialorganizer.app`). Without fingerprints it returns 404.
- **Production:** use the Play App Signing certificate (Play Console → App integrity → App signing → SHA-256), not the upload key.
- **Staging:** `ANDROID_APP_PACKAGE=com.socialorganizer.app.staging`, `ANDROID_CERT_SHA256` = the debug keystore fingerprint (`keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android`).
- **Check on a device:** `adb shell pm get-app-links com.socialorganizer.app.staging` shows `verified` once the file is served; re-run verification with `adb shell pm verify-app-links --re-verify <package>`.
- Live QR codes are always black on white with a 4-module quiet zone: phone cameras do not find a code that touches a dark background.

### iOS (App Store)

Capacitor-based iOS wrapper (`apps/web/ios/`) that loads the production web URL. Build via Xcode (`bash scripts/deploy-ios.sh` → Archive → Upload). Bundle `com.socialorganizer.app`, Apple ID `6768132198`. Listing/metadata are managed through the App Store Connect API (key in `secrets/asc/`). Web-only changes ship with the web deployment. Native changes, including edits to `Info.plist`, need a new Xcode archive. See the [iOS release guide](../IOS_DEPLOY.md) and [Sign in with Apple setup](../APPLE_SIGNIN.md).

#### Universal Links and push on iOS (from version 1.1, build 3)

- **Universal Links:** `App/App.entitlements` declares `applinks:www.orginizer.com` and `applinks:orginizer.com`; the API serves `/.well-known/apple-app-site-association` (and `/apple-app-site-association`) for `/invite/*`, `/i/*`, `/sos/*` with app ID `APPLE_TEAM_ID`.`APPLE_BUNDLE_ID` (defaults: `6MQRV9Q3H5`, `com.socialorganizer.app`). The app routes the link with the same `appLinkPath` as Android. The App ID needs the "Associated Domains" capability and a provisioning profile regenerated after enabling it.
- **Push:** `aps-environment` in the entitlements and `AppDelegate` hands the APNs device token to `@capacitor/push-notifications`; the app registers it with platform `ios`. The API sends to iOS tokens straight through APNs (`apns.service.ts`, HTTP/2 + ES256 provider token), Android tokens still go through FCM. Env: `APNS_KEY` (contents of the `.p8` from Apple Developer → Keys → Apple Push Notifications service), `APNS_KEY_ID`, optional `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_SANDBOX=1` for Xcode debug builds. Without `APNS_KEY` the API does not store iOS tokens, so delivery keeps choosing Telegram for those people. iOS asks for push only from Settings → Notifications (App Store 4.5.4); the tap on a push opens its page.
- **QR scanner:** `@capacitor-mlkit/barcode-scanning` ships CocoaPods only and this project is SPM, so on iOS the scanner uses the camera in the web view (`NSCameraUsageDescription` is set). The system Camera app opens invite QR codes through Universal Links.

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

There is one invite link per user — `https://www.orginizer.com/i/TOKEN`, shared from Add (link and QR). New accounts get an eight-character random `referralSlug` using unambiguous lowercase letters and digits. Older accounts get one when Add or Profile first requests their invite link. A person can edit the slug on the Add card ("Change link") or in Account. Custom slugs use 3 to 30 letters, digits, `_` or `-`, excluding reserved routes. Old `/i/<userId>` links keep working. `/i/TOKEN` redirects to `/invite/TOKEN` (`SlugRedirect`); the older `/?invite=TOKEN` form keeps working. A guest through a link skips the landing, so the invite screen links to "How Social Organizer works" (`/how?invite=TOKEN`); there the top button and the final call to action lead back to that invite instead of the stores. After sign-in a newcomer goes: invite (request sent automatically; signing in on the invite page continues without a page reload) → three intro frames (with a one-line "Already used Social Organizer through Telegram? Connect it" under the button for Google / Apple / e-mail accounts) → the name step, only when the account has no real name yet (an e-mail sign-up; Google, Apple and Telegram bring one) → the Circle. The amount is not asked before the Circle: new accounts start with the default intention (1 $), and the first step of the start checklist is "My intention: 1 $ · Change". While the request waits, the empty Circle shows who has to confirm it (a dashed node on the orbit and a card "Waiting for Anna to confirm" with "Remind", a share through the person's own messenger) and the header reads "Your network starts with one person you know" instead of 0 people and 0 $. First run is decided by the sign-in's `isNew` (all sign-ins return it, Telegram's Mini App and website widget too) and kept in `localStorage` (`so.firstRun:<userId>`) until the name step after the intro (`components/onboarding/flow.ts`). A newcomer in the Telegram Mini App goes through the same path: the intro when the app opens without a link, the invite or the Need when it opens with one. The person who opens it picks Telegram, the app or the browser. Inside the installed app `/invite/TOKEN` goes straight to `/login` (no landing), and `pendingInviteToken` is kept until `InvitePage` accepts it — also across the Google/Apple deep-link return (`socialorganizer://auth-success`).

Invite page details (SO-24):
- **Link preview:** `GET /invite/:token` and `GET /i/:slug` are answered by the API with `index.html` whose title, description and OG/Twitter tags name the inviter (`invite-preview.service.ts`): messengers read the HTML without JavaScript. Only the inviter's name and photo go into the card (no contacts, e-mail, network size or amounts); the photo is used when it is an https URL or our `/api/avatar/…`, otherwise the site picture. Language: `?lang=`, then `Accept-Language`, then the inviter's language. A preview never creates a request. Unknown or deleted inviters get the plain page.
- **Addressing the invited person:** `?to=Name` (letters, spaces, `-`, `'`, `.`, up to 40) puts "Name, …" before the title on the page and in the preview. It lives only in the shared address and is never stored. `/i/<slug>` keeps the query when it redirects.
- **After the request is saved:** a newcomer on the web (not the installed app, not the Mini App) sees "Request sent" with the sign-in method used, a reminder to sign in to the app the same way (the request is already on the server, so it is there after install) and the device's store; a computer gets a QR to `/get?invite=…`. "Later / Continue in the browser" goes on to the intro. No countdown or automatic redirect, so coming back from the store never loops.
- **Dead links** have their own screens: the inviter deleted the account (`INVITER_DELETED`), a one-time invite was used by someone else, or the link does not exist.
- **Invitation code by hand:** the sign-in screen (`/login`, when there is no pending invite) has "I have an invitation code". It takes the bare code (invite token, personal ID or user id), `/i/<slug>`, or a whole pasted message with the link (`inviteCodeFromInput` in `onboarding/flow.ts`), and opens `/invite/<code>` — the request is created there, after sign-in, as with the link.
- **Wording:** the title is "<Name> invites you" (no "circle", per the client's request of 30.10); Arabic and Hebrew use the gender-neutral "An invitation from <Name>". The corner language chip uses logical `end-*` placement and the top row reserves room for it, so the brand line is never covered (320 px, RTL).

### Connecting Telegram to an existing account

Account (`/me/account`) → "Connect Telegram" (shown to users who signed in with Google / e-mail / Apple) creates a link code and opens `t.me/<bot>?startapp=link_CODE` without showing the digits. `loginWithTelegram` reads `start_param` from the signed initData and calls `linkTelegramByCode` (`apps/api/src/services/telegram-link.service.ts`): a Telegram that was never used is attached to the code owner; an empty duplicate account (no connections, collections or obligations) is merged — Telegram and pending invite requests move over, the duplicate is deleted; a duplicate with data is left alone (`linkResult: 'conflict'`, the mini app shows a message) — unless the code owner is the empty one: a person who came back with Google / Apple / e-mail and got a fresh account is folded into the Telegram account with the network (`mergeEmptyAccountInto`: sign-in methods, a proven e-mail and open invite requests move over, the empty account is deleted, `linkResult: 'merged'`). Signing in with Google from a Telegram link code folds an empty Google account the same way. A new account made with Google, Apple or e-mail sees "Already used Social Organizer through Telegram? Connect it" on the intro. The Telegram contact is editable by hand until Telegram is connected; the account e-mail fills the e-mail contact.

### Redesign migrations

Make sure the redesign migrations in [the migration history](../packages/db/prisma/migrations/) are applied before deploying:

- `20261109120000_ask_block_reason_invite_ttl`
- `20261109140000_connection_via_collection`
- `20261109160000_collection_moderation`
- `20261110120000_milestones_by_meaning`
- `20261111120000_load_fixes` (index `notifications(collectionId)`, table `user_avatars`; the code works without it, photos then stay as data URLs)
- `20261113100000_accepted_seen_on_server` (two nullable columns on `pending_connections`; confirmations older than a day are marked seen). Apply before deploying: `pending.acceptedRecent` reads these columns
- `20261113160000_graph_signature_indexes` (indexes `connections(createdAt)` and `users(deletedAt)`; the code works without them, the graph signature is then slower)
- `20261113140000_connection_source` (nullable `source` on `connections` and `pending_connections`, table `invite_open_days`). Apply before deploying: every read of a connection or a request selects the new column
- `20261109180000_user_inactivity_cleanup` (inactivity stage and warning timestamps)

## Backups & Disaster Recovery

The network must survive losing the database or the hosting provider. Three independent copies:

1. **Nightly database dump → Cloudflare R2** (off Railway). Railway cron service `db-backup` (`ops/backup/`, 01:17 UTC) runs `pg_dump --format=custom` and uploads it through the `so-backup-ingest` Worker into the private bucket `social-organizer-backups`. Retention: `daily/` 35 days, `monthly/` (1st of month) 400 days. The Worker holds the bucket binding; the service only knows its ingest key (`BACKUP_INGEST_KEY`), not a Cloudflare account token. List: `GET https://so-backup-ingest.lambertain.workers.dev/list` with `Authorization: Bearer <key>`.
2. **Gun.js relay on a persistent volume.** The API attaches the Gun relay (`apps/api/src/gun-relay.ts`, file `gun-data`); `/app/gun-data` is a Railway volume, so the server-side graph copy survives deploys. The relay needs a valid access token (`/gun?token=<jwt>`, added by `@so/gun-backup` on every reconnect) and each connection only reads and writes its own node `so-backup/<userId>`.
3. **Graph copy on every device** (shown to the person when there is no connection, see [app features](application.md#key-features)). `useGraphSync` saves the user's network (3 levels: nodes + edges) every 5 minutes to IndexedDB (`@so/gun-backup`), plus Gun for cross-device sync. Before 03.10.2026 the copy lived only in memory — Gun ran with `localStorage:false` and no storage adapter.

### Restore the database on a new host
```
curl -H "Authorization: Bearer $KEY" https://so-backup-ingest.lambertain.workers.dev/list          # pick the latest daily/*.dump
curl -H "Authorization: Bearer $KEY" -o so.dump https://so-backup-ingest.lambertain.workers.dev/b/daily/<file>
createdb social_organizer && pg_restore --no-owner --no-acl -d "$NEW_DATABASE_URL" so.dump
```
Then point `DATABASE_URL` of the API to the new database and deploy. Never restore over the production DB in place — restore into a new database and switch.

### Incident 26.09–03.10.2026
The hourly `cleanup-blocked-pending` worker treated any failed `getChat` as "user blocked the bot" and deleted 29 active users at midnight runs (hard delete for users without invitees, soft delete otherwise). Fixed in `ea97719`: only HTTP 403 counts as blocked, and a run stops after 3 removals with an alert to the support chat. On 11.11.2026 the send path did the same to a newcomer: the first notification after their invite was confirmed got 403 "bot can't initiate conversation with a user" (they signed in without pressing Start in the bot), the account was muted and they made a second one with Google. Now only an explicit "bot was blocked by the user" / "user is deactivated" mutes anyone (`isBlockedError`, also in the nightly `getChat` check), every 400/403 send failure is logged with Telegram's description, and a muted account comes back when its owner signs in again (`account-restore.service.ts`: a deleted account that still has connections was muted by the bot, since the owner's own deletion removes every connection). Local check: `apps/api/scripts/check-account-recovery.ts`. 28 wrongly removed users were restored (soft-deleted ones fully; hard-deleted ones re-created with the same ids, Telegram link and contacts from the support chat log — their connections were lost).

## Security architecture

For private reporting, see the [security policy](../SECURITY.md).

- **Tokens.** Authenticated requests are authorised by an access token with a valid HMAC signature and expiry (`verifyToken` in `apps/api/src/services/auth.service.ts`); refresh tokens are accepted only by `auth.refresh`. `JWT_SECRET` has no default, also not for hashing e-mail codes.
- **Single sign-in screen (SO-21)** — `/login` shows one screen "Sign in or create an account" with Google, Apple, Telegram and "E-mail: we'll send a code"; the server decides whether the account is new, no password is needed. `auth.methods` tells which methods are available, a disabled one is hidden (no e-mail service in production → the e-mail button falls back to e-mail + password; Telegram Login Widget is off until `TELEGRAM_LOGIN_WIDGET=1`; until then the button opens the bot's mini app). With the widget on, the site keeps its own Telegram button and opens Telegram's login popup with `Telegram.Login.auth` (the bot's public numeric id comes in `auth.methods.telegramBotId`; telegram-widget.js is loaded ahead of the click), so Telegram's smaller widget button never replaces it; the popup returns the same signed data the server checks in `loginWithTelegramWidget`. The last used method (method only, no account data) is kept on the device for a hint.
- **E-mail codes** — `auth.requestEmailCode` / `auth.verifyEmailCode` (`services/email-code.service.ts`): 6 digits, 10 min, only the latest code works, a new code no sooner than 60 s and at most 5 per address per hour, 5 wrong entries burn the code, one use (a second request with the same code gets nothing). The answer to "send a code" does not reveal whether the address is registered. Only an HMAC of the code is stored in the database. For local development, keep the outbox private. Mail goes through Resend (`RESEND_API_KEY`, `MAIL_FROM`); without a key a non-production server writes messages to a local outbox file (`DEV_MAIL_OUTBOX`).
- **Account matching** — `services/identity.service.ts`: Google/Apple sign-in finds the person by the provider account, then by an e-mail proven on both sides (`emailVerifiedAt`, or an account that never had a password). A password account whose e-mail was never proven is not taken over: the answer is `ACCOUNT_EXISTS_OTHER_METHOD`, the screen asks to sign in with an e-mail code first. A parallel first sign-in with one provider account creates one user. Telegram on the website uses the Login Widget, checked on the server (`validateTelegramWidget`); a bare Telegram id is never accepted.
- **Assistant limits** (in memory, per person): `chat.send` 30 per hour and 100 per day, `chat.speak` 40 per hour, plus a daily cap for everyone together (5,000 messages, 3,000 voice answers); over the limit the answer is `TOO_MANY_REQUESTS`. Change with `CHAT_LIMIT_PER_HOUR`, `CHAT_LIMIT_PER_DAY`, `CHAT_LIMIT_ALL_PER_DAY`, `SPEAK_LIMIT_PER_HOUR`, `SPEAK_LIMIT_ALL_PER_DAY`. The system prompt (screen guide plus FAQ rows in the requested language or English, when available) is kept for 10 minutes per language.
- **Rate limits** (in memory, per client IP from `X-Real-IP`): 600 requests/min on everything except `/api/avatar/*`; 30 per 15 min on guessable sign-in procedures (e-mail code request/check, email login/register, link-code login/claim); 10 wrong link-code attempts per hour per IP (and per Telegram/Apple account) across every flow that accepts a 6-digit code. Link-code issue and use are logged with `[link-code]`.
- **Data exposure.** `user.me` never returns the password hash or coordinates; `user.getById` returns a phone only under the same rule as contacts (`canViewContacts`). `cluster.list` (whole connected components with names and intentions) answers admins only. Before 13 Nov 2026 any signed-in person could call the cluster endpoints.
- **Push.** `push.subscribe` won't move an endpoint owned by another user unless the subscription keys match (same browser, another account) — otherwise 403.
- **Received marks** are the author's own record: `collection.getById` returns `confirmedAt` only to the author of the Need. Other people see only the two profile counts from `stats.participationFacts`.
- **Collection chat links** must be `http(s)://` (no `javascript:` links on the collection page or in bot buttons).
- **Telegram webhook** is registered with a `secret_token` (derived from the bot token); calls without the matching `X-Telegram-Bot-Api-Secret-Token` header get 401.
- **CORS** allows only our own origins (orginizer.com, the Capacitor app, local dev, `WEB_APP_URL`).
- **Image proxy** (`/api/image-proxy`) fetches only https avatars from Telegram (`t.me`, `*.telesco.pe`, Telegram CDNs) and Google (`*.googleusercontent.com`), only jpeg/png/webp/gif up to 5 MB, with `nosniff`.
- **Uploaded photos** (`services/avatar.service.ts`): `user.update` accepts a JPEG/PNG/WebP data URL up to 150 KB, stores the bytes in `user_avatars` and puts `/api/avatar/<userId>/<hash>` into `photoUrl`; any other data URL is refused. The address answers only while it is the person's current photo (cached as immutable; a new photo has a new address). Photos stored the old way are moved at start-up. Until migration `20261111120000_load_fixes` is applied, photos stay data URLs as before.
- **Compression.** JSON and text answers over 1 KB are sent with brotli or gzip (`@fastify/compress`).
- **No credentials in the repo.** Ops scripts read the database from `DATABASE_URL`; passwords and tokens live in Railway variables and the portal.
- **No public source maps.** The production web build has `sourcemap: false` (`apps/web/vite.config.ts`); build with `--sourcemap` locally to debug.
- **Page zoom is allowed** (no `user-scalable=no` / `maximum-scale` in `index.html`). Fields drawn at 15 px (`text-body-s`) carry `so-field`, which lifts them to 16 px on touch screens (`index.css`), so iOS does not zoom in on focus; large fields such as the Need amount keep their own size; the 3D scene keeps pinch for its own camera (OrbitControls sets `touch-action: none` on the canvas).
