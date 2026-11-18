---
id: 20261118-open-questions
title: Open questions and findings
tags: [sources, mechanics]
created: 2026-11-18
updated: 2026-11-18
related: [20261118-sources, 20261118-need-protocol, 20261118-claims, 20261118-packaging-plan, 20261118-funding-strategy, 20261118-landing-concepts, 20261118-latent-connectedness]
summary: Questions the team needs to answer before the distillation, landing and funding steps, plus product gaps and bugs found while checking the live app on 2026-11-18.
---

# Open questions and findings

> Summary: Questions the team needs to answer before the distillation, landing and funding steps, plus product gaps and bugs found while checking the live app on 2026-11-18.

## Context

Close a question by writing the decision and the date next to it, then move the decision into the
note it affects.

## Details

### Material to collect

1. The chat the "How It Works" brief came from (it is not in the `6afce8ee` share).
2. The link and transcript of the published video *Direct Mutual Support Through Real Connections*.
3. The TEDx talk (link), mentioned among the landing's secondary materials.
4. The end of the GoFundMe row in the comparables table (cut off in the paste).
5. The list of people and organisations already written to, to check the influencer and funder candidates.

### Packaging decisions

1. **Inevitability vs precision.** *Proposed answer (2026-11-18):* state the law as the author's
   report does: conditional on N ≥ N* and m(N) > 1, with its tests ([the law](../theory/autocatalytic-law.md)).
   Confirm with the author.
2. **Dollars or euros in examples.** The brainstorm and both landing chats use euros (€1, €300,
   €5,000); the app counts in US dollars. Proposal: dollars in everything that shows the app.
3. **First audience for stage 2.** Participants through community leaders, or builders and donors?
4. **Opening.** Candidate from the landing chat: "The world is already connected" (fewer than four people in between, 2016),
   which is also the report's premise. Or a real human case from the network, with consent.
5. ~~"What becomes possible next" on the landing?~~ Decided 2026-11-18: yes, one labelled "next"
   line about coordination in the network (core message, section 8).
6. ~~"Crowdfunding of intentions": one meaning only?~~ Decided 2026-11-18: it is both, Participation
   in a Need now and initiatives later (see the vocabulary note).
7. **Landing concept** (stage 3, not now): two ChatGPT proposals are collected in the landing
   concepts note. The user has not seen them yet; show them when the landing work starts.

8. **A figure in the report.** Lubalin's report gives 4.74 (2011) and 3.57 (2016) as the same
   measure. 4.74 is the average distance in links; 3.57 is the number of people in between (the 2016
   distance is 4.57, Facebook Research). Worth correcting in the report and in talks before donors
   or researchers notice.

### Funding decisions

1. ~~Independence condition.~~ Decided 2026-11-18: not a question for this stage; the core stays
   open and non-profit, commercial ideas may later be added on top, carefully.
2. **Two tracks** (later, when funding talks start). How to arrange institutional funding of SO and personal patronage of the author
   (possibly separate agreements).
3. **Verify the funder facts** the chat gave (programmes, grant sizes) before any outreach.

### Product findings from the code check (for the development backlog, not for packaging)

1. **Invite page shows wrong numbers.** `invite.network` ("people in the network") shows the
   inviter's direct connections; `invite.canHelp` ("declared participation of the network") shows
   the sum of the inviter's own Participation (`apps/api/src/routers/invite.router.ts:304-317`).
   This is the first screen a newcomer sees.
2. **Chat link reaches the client before Participation.** `collection.getById` returns `chatLink` to
   any signed-in viewer; only the UI hides it (`collection.router.ts:241-242`).
3. **Regular cycle rollover adds a "Need closed" feed entry** to participants every 28 days
   (`workers/cycle-close.worker.ts:112-127`), which reads as if the Need ended.
4. **"Declared participation of the network"** is called the remaining budget in code but is never
   lowered after Participation; in practice it is the sum of declared intentions. Confirm.
5. **`SPEC.md` is outdated** in eight places (table in the protocol note).
6. **Old recording scripts** (`docs/first-steps`, `docs/regular-collection`) use i18n keys and
   selectors that no longer exist.
7. **Bilateral acceptance vs two shortcuts.** The report's second condition is entry by invitation
   and *independent bilateral acceptance*. Joining from a public Need page (`/sos/:id`) creates a
   direct connection with the author without the author accepting that person; the live QR connects
   both at once (both people are present and act). Decide whether these fit the condition or need a
   confirmation step ([latent connectedness](../theory/latent-connectedness.md)).
8. **Who confirms a completed action.** The report says a participant can confirm a completed
   action; in the app only the Need's author marks "received".
9. **Activity facts are hidden at zero.** The person page shows "Participation reported" and
   "Marked as received by authors" only when the first is above zero, and nobody sees how many Needs
   a person reported. A person who only asks looks like a newcomer. Options from the test run: show
   the facts on the Need page next to the author's name, also at zero, with "in the network since
   <month>"; decide whether the number of Needs is shown as a fact.
10. **Circle moderation has two exits.** The author can close a Need during a review (it ends
    INCONCLUSIVE and the complaints are removed), and nobody can complain after a Need is closed.
    Proposed by a test run: no close or cancel while a review is open (or let the review finish), and
    a complaint window of about 14 days after closing. Check first how often it happens.
11. **One-tap inquiry.** The handshake chain on the Need page is plain names
    (`components/ui2/PathFigure.tsx`); making them links to the person pages, and showing "N people
    from your circle know the author" (the shared-acquaintance count already exists for
    suggestions), would shorten the "find out for yourself" step without a new feature.
12. **No LICENSE file.** The README says MIT, but the repository has no `LICENSE` file. Donors and
    contributors will check it.
13. **Live landing copy overstates two rules.** `landing.steps.s3Text` says a Need "reaches exactly
    {{n}} people" and "closes once participants cover the amount". In code a Need sends up to N
    external messages (people at their message limit get an in-app entry instead), and when the
    amount is reported the Need pauses; only the author closes it (found by a test run, 2026-11-18).

## Related
- [Sources](sources.md) — where the material came from.
- [The Need protocol](../mechanics/need-protocol.md) — context for the product findings.
- [Claims](../principles/claims.md) — context for packaging question 1.
- [Packaging plan](../packaging/packaging-plan.md) — what these decisions unblock.
- [Funding strategy](../funding/funding-strategy.md) — context for the funding decisions.
- [Landing concepts](../packaging/landing-concepts.md) — context for packaging questions 4–7.
- [Latent connectedness](../theory/latent-connectedness.md) — context for finding 7.
