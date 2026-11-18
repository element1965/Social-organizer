---
id: 20261118-packaging-plan
title: Packaging plan — from the data pool to the landing and in-app teaching
tags: [packaging, toolkit]
created: 2026-11-18
updated: 2026-11-18
related: [20261118-core-message, 20261118-how-it-works-video-idea, 20261118-audiences, 20261118-open-questions, 20261118-sources, 20261118-landing-concepts, 20261118-funding-strategy, 20261118-cold-start-influencers]
summary: The agreed order of the packaging work (collect the pool → distil what matters → redesign the landing and web → in-app teaching) and which project and installed skills serve each stage.
---

# Packaging plan — from the data pool to the landing and in-app teaching

> Summary: The agreed order of the packaging work (collect the pool → distil what matters → redesign the landing and web → in-app teaching) and which project and installed skills serve each stage.

## Context

Goal (2026-11-18): package the project for promotion, for attracting like-minded people and
financial donors. The user set the order: first collect everything into one pool and extract what
matters most (how to package, tell and explain it); only then a full redesign of the landing and
the web part, and teaching inside the app. Nothing beyond stage 1 is started yet.

## Details

### Stages

| # | Stage | Output | Status |
|---|---|---|---|
| 1 | **Collect the pool** | This knowledge base (`docs/narrative/`), project skills `so-trust-lens`, `so-story`, `so-explainer` | Done 2026-11-18; extend as the brainstorm continues |
| 2 | **Distil** | The few messages that carry the project: one line, the story order, the answer to "why join now", the answers per audience | Accepted by the user 2026-11-18: [the core message](../core/core-message.md); waiting for Andrei Lubalin's read and a five-person test |
| 3 | **Landing and web redesign** | New landing, `/how`, invite and public Need pages built on stage 2 | Not started; two concepts collected in [landing concepts](landing-concepts.md) |
| 4 | **In-app teaching** | First-run teaching inside existing steps (intro, empty Circle, path to the first Need, first Participation) | Not started |
| — | Ideas parked for later decision | The "How It Works" video ([idea](how-it-works-video-idea.md)), the influencer pilot ([plan](../audiences/cold-start-influencers.md)), the funding programme ([strategy](../funding/funding-strategy.md)) | Ideas only |

### Skills per stage

Project skills (in `.claude/skills/`, versioned with the repo):

| Skill | Use it for |
|---|---|
| `so-trust-lens` | Checking any mechanic, screen, growth or anti-abuse idea against the conditions of trust |
| `so-story` | Any text that explains SO: landing, posts, pitch, onboarding, FAQ, assistant |
| `so-explainer` | Teaching by play and prediction (Case's method): landing explainer, `/how`, in-app teaching |

Installed skills that fit:

| Stage | Skills |
|---|---|
| 1–2 Collect and distil | `desktop-commander:knowledge-base` (pool structure), `anthropic-skills:skill-creator` (project skills), `stop-slop` (prose), `design:research-synthesis` (when interviews or feedback arrive), `marketing:competitive-brief` (study of the comparables), `anthropic-skills:doc-coauthoring` (writing the distilled message with the team) |
| 3 Landing and web | `ui-design-workflow` (order of work and which design skill when), `design-references` (real references), `hallmark` or `design-taste-frontend` (new pages), `impeccable` (redesign of existing screens), `ui-ux-pro-max`, `anti-ui-slop`, `make-interfaces-feel-better`, `motion` (animation), `web-design-guidelines` and `design:accessibility-review` (audit), `marketing:seo-audit`, `marketing:brand-review` (copy against `so-story`), `design:ux-copy` |
| 4 In-app teaching | `so-explainer`, `design:ux-copy`, `impeccable` (onboarding, empty states), `design:user-research` (check with real people that they can explain SO back) |
| Promotion | `marketing:campaign-plan` (influencer and donor campaigns), `marketing:content-creation` / `marketing:draft-content`, `canvas-design` (posters, covers) |
| Video, if decided | `watch:watch` (review the published video and references; needs setup), `stageshow` only for diagrams, never for faked app screens |

## Related
- [The core message](../core/core-message.md) — output of stage 2.
- [How It Works video idea](how-it-works-video-idea.md) — parked idea from the brainstorm.
- [Audiences](../audiences/audiences.md) — input for stage 2.
- [Open questions](../meta/open-questions.md) — decisions needed before stage 3.
- [Sources](../meta/sources.md) — where the pool's material came from.
- [Landing concepts](landing-concepts.md) — input for stage 3.
- [Funding strategy](../funding/funding-strategy.md) — parallel track: donors.
- [Cold start through community leaders](../audiences/cold-start-influencers.md) — parallel track: growth.
