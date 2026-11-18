---
id: 20261118-open-questions
title: Open questions and findings
tags: [sources, mechanics]
created: 2026-11-18
updated: 2026-11-18
related: [20261118-sources, 20261118-need-protocol, 20261118-claims, 20261118-packaging-plan]
summary: Questions the team needs to answer before the distillation and landing stages, plus product gaps and bugs found while checking the live app on 2026-11-18.
---

# Open questions and findings

> Summary: Questions the team needs to answer before the distillation and landing stages, plus product gaps and bugs found while checking the live app on 2026-11-18.

## Context

Close a question by writing the decision and the date next to it, then move the decision into the
note it affects.

## Details

### Material to collect

1. The full brainstorm text (the shared ChatGPT link needs sign-in).
2. The link and transcript of the published video *Direct Mutual Support Through Real Connections*.
3. The end of the GoFundMe row in the comparables table (cut off in the paste).

### Packaging decisions

1. **Inevitability vs precision.** The canonical glossary speaks of "mathematically proven
   inevitability" of growth; the brainstorm and the claims note treat growth as a hypothesis. Which
   wording goes public?
2. **Dollars or euros in examples.** The brainstorm uses €1 and €5,000; the app counts in US
   dollars as a common unit. Proposal: dollars in everything that shows the app; any currency in
   stories that happen outside it.
3. **First audience for stage 2.** Participants through community leaders, or builders and donors?
   The answer decides which text gets distilled first.
4. **Story hook.** Case opens with the 1914 Christmas truce. Do we want a human opening story of
   our own (a real case from the network, with consent)?

### Product findings from the code check (for the development backlog, not for packaging)

1. **Invite page shows wrong numbers.** `invite.network` ("people in the network") shows the
   inviter's direct connections; `invite.canHelp` ("declared participation of the network") shows
   the sum of the inviter's own Participation (`apps/api/src/routers/invite.router.ts:304-317`).
   This is the first screen a newcomer sees.
2. **Chat link reaches the client before Participation.** `collection.getById` returns `chatLink` to
   any signed-in viewer; only the UI hides it (`collection.router.ts:241-242`). Decide whether the
   server should hide it.
3. **Regular cycle rollover adds a "Need closed" feed entry** to participants every 28 days
   (`workers/cycle-close.worker.ts:112-127`), which reads as if the Need ended.
4. **"Declared participation of the network"** is called the remaining budget in code but is never
   lowered after Participation; in practice it is the sum of declared intentions. Confirm that this
   is intended.
5. **`SPEC.md` is outdated** in eight places (table in the protocol note). Update it or mark it as
   historical.
6. **Old recording scripts** (`docs/first-steps`, `docs/regular-collection`) use i18n keys and
   selectors that no longer exist.

## Related
- [Sources](sources.md) — where the material came from.
- [The Need protocol](../mechanics/need-protocol.md) — context for the product findings.
- [Claims](../principles/claims.md) — context for question 1.
- [Packaging plan](../packaging/packaging-plan.md) — what these decisions unblock.
