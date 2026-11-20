---
id: 20261118-need-protocol
title: The Need protocol as the live app implements it
tags: [mechanics]
created: 2026-11-18
updated: 2026-11-20
related: [20261118-user-journey, 20261118-trust-conditions-in-so, 20261118-vocabulary, 20261118-open-questions]
summary: Verified fact sheet of what the production app does today (network, access rule, Need, notification waves, Participation, closing, regular cycles, public page), with numbers, UI strings and code references, plus where SPEC.md is outdated.
---

# The Need protocol as the live app implements it

> Summary: Verified fact sheet of what the production app does today (network, access rule, Need, notification waves, Participation, closing, regular cycles, public page), with numbers, UI strings and code references, plus where SPEC.md is outdated.

## Context

Checked against the code on `main` (production) at `ad02ee81` on 2026-11-18; the three later
Lambertain commits on `main` change iOS push, the login invitation code and one invite string, not
these mechanics. **Code and `packages/i18n/locales/en.json` are the source of truth; `SPEC.md` is
partly outdated** (table at the end). Re-verify before any video or landing goes out, and bump
`updated` here when you do. Strings are quoted as `key` = "English text".

## Details

### 1. The network

| Fact | Evidence |
|---|---|
| Invite link on `/add`; the newcomer opens `/invite/:token`; this creates a request that the **link owner confirms**: "We know each other" / "We don't know each other" | `pages/AddPage.tsx:52`, `api/routers/invite.router.ts:157-170`, `circle/AcquaintSheet.tsx:136-144` |
| Live QR (`/add/qr`, `/add/scan`) lasts 60 s and connects both at once, no confirmation step; also shake-to-connect (3 s window) | `add/LiveQr.tsx:10,107`, `invite.router.ts:111-134`, `services/shake.service.ts:56` |
| "You may know each other": people at the 2nd handshake with ≥2 shared acquaintances, up to 8; the other person confirms | `add/SuggestList.tsx:70-118`, `shared/constants.ts:48-49` |
| Rings: 1st/2nd/3rd show names (`VISIBLE_RINGS=3`); a Need travels up to 6 handshakes | `RingChips.tsx`, `services/network.service.ts:38-40` |
| Home `/` is the 3D graph (`@so/graph-3d`); active incoming Needs pulse along the path | `pages/CirclePage.tsx`, `CircleGraph.tsx:8` |
| Home numbers: "{{count}} people in your network" and "Declared participation of the network" (sum of declared intentions in rings 1–3) | `NetStats.tsx:30-50` |
| "My intention" = the person's default Participation, edited at `/me/stake` | `nav.stake`, `user.router.ts:198-203` |
| Cap: 150 acquaintances per person; a connection can be removed ("Remove from circle") | `constants.ts:1`, `connection-request.service.ts:72-77`, `connection.revoke` |

### 2. Access rule for reporting a Need

At least **5 direct connections and 10 people in the network**, checked on the server. The network count
goes to the 6th handshake (`NETWORK_MAX_DEPTH = 6`), includes the direct connections and excludes the person;
so a group that joins together needs 11 people for everyone to pass (each confirming at least 5 of the others).
Until then the Need tab opens the "path" sheet: `path.title` = "Almost there: soon people will
learn of your Need", with "Your circle N of 5" and "Network N of 10" and a "Remind" button.
There is **no cap** on the first amount (decision 2026-11-09), only a soft warning when it exceeds
the network's declared participation: `ask.amountWarn`.
Evidence: `constants.ts:21-22`, `services/ask-access.service.ts:41-73`, `services/network.service.ts` (`bfsNetwork`, self excluded), `network-figure.ts:13`, `PathToRequest.tsx:136-167`, `config/ask.ts:3`.

### 3. Reporting a Need (`/ask`)

| Field / rule | Value |
|---|---|
| Amount | "How much is needed", whole US dollars, **minimum $10**, USD only |
| Type | "Emergency" (once) or "Regular" (every 28 days) |
| Participants' chat | **Required**, any messenger, must be an `https` link |
| Description | Accepted by the API (≤300 chars) but **not shown in the form**: everything is discussed in the chat |
| Large amount | Above $10,000: "Amount {{amount}}, is that right?" → "Yes, send" / "Change amount" |
| Limit | One open Need of each type per person |
| Button | `ask.submit` = "Report a Need"; reach line `ask.reach` = "{{network}} people can see it: your {{direct}} first, then their people." |

### 4. Who gets notified

- **$1 = 1 person**, nearest by handshakes first (`NOTIFICATION_RATIO=1`, `notification.service.ts:78-90`).
- Nuance: the dollar budget counts *external* messages (Telegram or push). A person whose personal
  limits are reached (2 a day, 6 a week, 5 ignored in a row → pause 14 days) or who has no
  external channel gets only an in-app entry, which does not use a slot (`notify-routing.service.ts`).
- **Repeat waves (Emergency only):** every 12 hours, while the Need is open and short, new people
  (not yet notified) are reached for the shortfall amount, further along the handshakes
  (`workers/re-notify.worker.ts`, `RE_NOTIFY_INTERVAL_HOURS=12`). Waves stop when the amount needed
  is reported.
- In-app request entries expire after 24 hours.

### 5. What a notified person sees before taking part (`/collection/:id`)

- The author's name, type and date; the **handshake chain** to the author (`PathFigure`, people
  beyond the 3rd ring shown as "…"); the progress meter; the stage rail "Amount / Chat / Closed";
  `collection.closesNote` = "{{name}} closes the Need. Reported Participation may not reach the amount needed."
- The author's **activity facts are one tap away**: the name opens `/person/:id` with
  "Participation reported" and "Marked as received by authors" (`PersonPage.tsx:402-408`). The block
  is **hidden while the person has reported no Participation** (`reported > 0`, `PersonPage.tsx:401`),
  so someone who only reports Needs looks the same as a newcomer. The number of Needs a person
  reported is **not shown** to others (`stats.participationFacts` counts Participation only).
- The participants' chat button appears only after Participation (UI). Note: the API returns the
  link to any signed-in viewer (see [open questions](../meta/open-questions.md)).

### 6. Participation

- "Report Participation", **minimum $1**, prefilled with "My intention": "Your intention is
  {{amount}}. You can name more." (`constants.ts:2`, `CollectionPage.tsx:156-161`)
- **Reversible while the Need is open:** "Change" (up or down, min $1) and "Withdraw Participation"
  (`obligation.updateAmount`, `obligation.unsubscribeFromCollection`).
- After reporting: "Open participants' chat". Participants can also pass the Need on:
  `collection.shareNext` = "Pass this Need on to others who know its author." (share, WhatsApp, Telegram buttons).
- Words: the action is **Participation**; the default amount is **intention**; "commitment" is not used.

### 7. Progress and coverage

- Meter: "You / Others / Reported / Needed"; "Participants: {{count}}". The page refreshes every
  30 s (not pushed live).
- When reported Participation reaches the amount, the Need pauses: "Amount needed is reported";
  it **reopens by itself** if Participation drops below the amount.

### 8. Closing and activity history

- Only the author closes, at any time, also early: "Close Need" → "{{current}} of {{goal}} reported."
- Everyone who was notified gets "Need closed" (in-app plus Telegram/push).
- The author can "Mark as received" next to a participant; the mark is a private note of the author.
- Activity (`/me/history`): "You took part" (sum and count), "In your needs" (sum and count),
  "marked as received". Other people see "Participation reported" and "Marked as received by
  authors" on the person's page. **No rating, no "helped" badge.**

### 9. Regular support (every 28 days)

- Announced **once**, at creation; no repeat waves.
- 28-day cycles roll over automatically; Participation carries over to the next cycle until the
  participant withdraws. A participant may press "Confirm {{amount}}" in a new cycle
  (acknowledgement only). Reminder 3 days before the cycle ends.
- The author stops it with "Close Need". Quirk: each rollover also adds a "Need closed" feed entry.

### 10. Public page of a Need

`/sos/:id`: "{{name}} needs assistance", "Participants: {{count}} · money is handed over directly,
not through the service", button "Join". Joining creates a **direct connection with the author
without confirmation** (150 cap applies). The author has a QR sheet ("Need QR", "Download for print")
and share buttons; link previews are generated for messengers.

### 11. Circle moderation (complaints)

People decide, not the platform: participants can complain about an open Need; **3 complaints**
open a review in which the author's direct connections answer "problem", "OK" or "don't know"
within **48 hours**. Quorum: at least 3 answers and 30% of those asked. **UPHELD** needs at least two
"problem" answers and more "problem" than "OK"; then the Need is paused ("decision of the circle").
No quorum or a tie is INCONCLUSIVE. A person whose complaints are dismissed twice cannot complain
for 30 days. An admin can also pause a Need with a reason. Evidence:
`apps/api/src/services/moderation-rules.ts`, `moderation.service.ts`, `collection.block/unblock`.
Gaps found by a test run (2026-11-18): the author can close the Need during a review, which ends it
as INCONCLUSIVE and removes the complaints (`collection.router.ts:334-346`, `moderation.service.ts:446,471-473`);
after a Need is closed or cancelled, nobody can complain (`complainGate`, `moderation.service.ts:114`).

### 12. First-run teaching that exists

`/intro` (3 frames, "You are at the centre of your circle"), `/seed` ("Your intention", presets
1/5/15/30), empty home ("You are the first in your circle."), milestone pop-ups, `/how`, the
landing, `/me/help` (FAQ from the database, assistant, "Show the intro again").

### Where SPEC.md is outdated

| SPEC.md | Code today |
|---|---|
| USD and EUR | USD only |
| Commitment minimum 10, irreversible | Participation minimum $1, changeable and withdrawable |
| Connections irreversible | Removable |
| Author cannot unblock | Reopens automatically when Participation drops below the amount |
| Regular cycle on the 1st of the month | Rolling 28 days |
| Shortfall message at cycle end | None |
| Author/Developer Needs not broadcast | Broadcast like any other when an amount is set |
| Chat link hidden until participation | Hidden in UI only |

## Related
- [User journey](user-journey.md) — applies: the seven steps of the video story on these facts.
- [Trust conditions in SO](../trust/trust-conditions-in-so.md) — interprets: why these mechanics support trust.
- [Vocabulary](../principles/vocabulary.md) — supports: the words the UI uses.
- [Open questions](../meta/open-questions.md) — follow-up: bugs and gaps found during this check.
