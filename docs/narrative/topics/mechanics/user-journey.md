---
id: 20261118-user-journey
title: The participant's journey in seven steps (verified)
tags: [mechanics, packaging]
created: 2026-11-18
updated: 2026-11-18
related: [20261118-need-protocol, 20261118-how-it-works-video-idea, 20261118-packaging-plan, 20261118-principles]
summary: The seven-step story from the brainstorm (graph → notification → own inquiry → intention → live talk → closing → own protection, plus regular support), each step checked against the live app with the screen that shows it and the corrections needed.
---

# The participant's journey in seven steps (verified)

> Summary: The seven-step story from the brainstorm (graph → notification → own inquiry → intention → live talk → closing → own protection, plus regular support), each step checked against the live app with the screen that shows it and the corrections needed.

## Context

This journey is the backbone for the landing redesign, in-app teaching and the parked "How It
Works" video idea. The step wording comes from the 2026-11-17 brainstorm; the verdicts come from the
[Need protocol](need-protocol.md) check. Principle for every step: show what **people** can do
thanks to the app, not what the app does instead of them.

## Details

| # | Step (brainstorm) | What the person does | Screen(s) in the app | Verdict and correction |
|---|---|---|---|---|
| 1 | Building the graph | Invites people they know; each confirms the acquaintance; they invite their own | `/add` (link, QR, suggestions), `/invite/:token`, acquaintance sheet "We know each other", `/` 3D graph with rings 1st/2nd/3rd | **Verified.** Show the confirmation: it is what makes the graph "real connections". Scale: rings and "{{count}} people in your network". |
| 2 | The notification | Sees a Need: amount, the chain to the author, the author's activity | Telegram/push message → `/collection/:id` with `PathFigure`; tap the name → `/person/:id` facts | **Verified with a correction:** activity history is one tap away on the author's page, not on the Need screen. Show the tap. The Need has no description: the "why" lives in the chat. |
| 3 | Own inquiry | Contacts people from the chain, decides whether to take part | The chain names (e.g. Oleg) → off-app: a message to Oleg in their usual messenger | **Verified** (the chain is in the app; the inquiry happens outside it). This is the "nice, but not naive" step. |
| 4 | Crowdfunding of intentions | Reports a reversible Participation, e.g. $1; coverage expands until enough | "Report Participation" prefilled with "My intention"; meter "Reported / Needed"; repeat waves every 12 h | **Verified with corrections:** use **$1, not €1** (the app counts in US dollars). Expansion waves exist for Emergency Needs only and stop when the amount is reported. |
| 5 | Live interaction | Participants talk in their messenger, discuss, propose solutions, change their intentions | "Open participants' chat" (any messenger) → off-app chat; back in the app "Change" / "Withdraw Participation"; "Pass this Need on…" | **Verified.** The chat must look messenger-neutral (not only Telegram). |
| 6 | Closing and activity history | The author closes; the result enters the activity history; payments happen outside | "Close Need" → everyone notified gets "Need closed"; author's "Mark as received"; `/me/history` "You took part" / "In your needs"; others see "Participation reported" | **Verified with a wording fix:** say "activity history", not "reputation history" or "rating". Money moves outside SO (show a bank app or cash off-screen, no brand). |
| 7 | Own protection | Now the participant can report their own Need to their referential graph | Access rule (5 direct + 10 in network) → `/ask` "Report a Need" | **Verified.** Mention the rule only if the shot shows the path sheet; otherwise show a participant who already has a network. |
| + | Regular support (Patreon-like) | One initial notification, then repeating 28-day cycles of intentions | `/ask` "Regular" (`ask.every28Hint`), cycles, "Confirm {{amount}}", reminder 3 days before | **Verified:** announced once; Participation carries over; the participant may confirm or withdraw. |

### Things the brief implied that the app does not do

- A description or reason field on the Need (hidden in the form): the reason is told in the chat.
- Euro amounts: the app shows US dollars as the common unit; people choose the currency between themselves.
- Live push updates of the meter: the page refreshes every 30 seconds. Do not show numbers ticking in real time.
- Reputation scores: none exist. Show two plain facts.

## Related
- [The Need protocol](need-protocol.md) — evidence: numbers, strings and code references.
- [How It Works video idea](../packaging/how-it-works-video-idea.md) — uses: this journey as its plot (idea only).
- [Packaging plan](../packaging/packaging-plan.md) — uses: the journey in the landing and in-app teaching stages.
- [Principles](../principles/principles.md) — constrains: "people act, the app enables".
