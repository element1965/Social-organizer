# Social Organizer — narrative knowledge base

The pool of everything we know about how to explain Social Organizer: the idea, the project's own
theory, the principles, the verified mechanics, the trust research, audiences, funding, next stages
and sources. It serves the packaging work (landing, web, in-app teaching, promotion, donors) and the
project skills `so-trust-lens`, `so-story` and `so-explainer` in `.claude/skills/`.

Start here if you are new: [The core message](topics/core/core-message.md) → [What SO is](topics/core/what-so-is.md) →
[Principles](topics/principles/principles.md) → [The Need protocol](topics/mechanics/need-protocol.md) →
[Invitational coordination](topics/theory/invitational-coordination.md) →
[Trust conditions in SO](topics/trust/trust-conditions-in-so.md).

## How to use this KB (for agents)
1. Read this index first. Pick notes by their descriptions; open only those.
2. Prefer 1–3 specific notes over scanning everything.
3. Cite the note `id` when you use information from it.
4. Facts about the app come from `topics/mechanics/need-protocol.md`; re-check the code before
   publishing anything that shows the app, and bump `updated` there.
5. Notes marked "brainstorm" or "idea" are proposals, not decisions.

## How to update this KB (for agents)
- New idea → a new atomic note. Same idea changed → edit in place and bump `updated`.
- Any create, rename or delete updates this registry and the topic's `_topic.md` in the same change.
- New material → add a row to `topics/meta/sources.md`.
- Use only the tags below; add a tag here before using it.
- English text; quote Russian originals where the exact wording matters.
- This repository is public: keep raw chat transcripts and private contact details out of it.

## Controlled tags
`core`, `theory`, `principles`, `vocabulary`, `mechanics`, `trust`, `audience`, `comparables`, `funding`, `future`, `packaging`, `toolkit`, `sources`

## Registry
### core
- `20261118-causal-chain` — **The causal chain — from risk sharing to a self-developing environment** — `topics/core/causal-chain.md` — The project's central thesis (brainstorm of 2026-11-17): risk sharing starts the process, direct cooperation is its natural continuation, and the resulting social environment can develop on its own — with what is a fact and what is a hypothesis.
- `20261118-core-message` — **The core message (draft for the team)** — `topics/core/core-message.md` — Stage 2 of the packaging plan — the headline, the one sentence, a short scene, the story in five beats, the answer to "why join now", the questions a newcomer asks, proof points, what SO is not, one line and one ask per audience, and a five-person test. Russian is written first, English is its own version. Draft 2 after an editor's pass, waiting for the team.
- `20261118-what-so-is` — **What Social Organizer is (and is not)** — `topics/core/what-so-is.md` — Canonical descriptions of Social Organizer at several lengths (EN and RU), what it is not, and the facts that stay true in every description.

### theory
- `20261118-autocatalytic-law` — **The Law of Autocatalytic Inevitability — thresholds, measurement, limits** — `topics/theory/autocatalytic-law.md` — Lubalin's formal law of self-sustaining activation (k, q(N), p(N), m(N) > 1, critical mass N*), why "inevitability" is conditional, the parameters a deployment must measure, the conditions that would disconfirm it, and what the MVP did and did not test.
- `20261118-invitational-coordination` — **Invitational coordination — the theory behind SO (Lubalin, 2026)** — `topics/theory/invitational-coordination.md` — Andrei Lubalin's core distinction — coercive vs invitational interaction by the consequence of refusal, the two coordination mechanisms (command → control → coercion; idea → consensus → assistance) and the causal sequence from mechanism to social environment — and how it meets Case's "the game defines the players".
- `20261118-latent-connectedness` — **Latent global connectedness and the conditions of its activation** — `topics/theory/latent-connectedness.md` — The empirical premise (the world's social graph is already connected — 4.74 handshakes between two Facebook users in 2011, 4.57 in 2016, fewer than four people in between), the motivation (a calculable benefit of spreading one person's loss among many), the four conditions of activation, and what Social Organizer does and does not do as a "social utility".

### principles
- `20261118-claims` — **Claims — what we may say in public** — `topics/principles/claims.md` — Which statements about SO are safe facts, which need careful wording (theses, hypotheses, research), and which are forbidden, with rewrites.
- `20261118-principles` — **Principles of Social Organizer** — `topics/principles/principles.md` — The principles every SO text, screen and feature must respect — the network first, people act and the app enables, voluntary and independent decisions, direct connection, no arbiter or rating, payments outside, possibility is not a guarantee.
- `20261118-vocabulary` — **Vocabulary — words to use and words to avoid (EN/RU)** — `topics/principles/vocabulary.md` — Canonical English and Russian terms for SO (Need, Participation, intention, risk sharing, handshake, participants' chat, activity…), the words that are forbidden in public, and the style rules for SO texts.

### mechanics
- `20261118-need-protocol` — **The Need protocol as the live app implements it** — `topics/mechanics/need-protocol.md` — Verified fact sheet of what the production app does today (network, access rule, Need, notification waves, Participation, closing, regular cycles, public page), with numbers, UI strings and code references, plus where SPEC.md is outdated.
- `20261118-user-journey` — **The participant's journey in seven steps (verified)** — `topics/mechanics/user-journey.md` — The seven-step story from the brainstorm (graph → notification → own inquiry → intention → live talk → closing → own protection, plus regular support), each step checked against the live app with the screen that shows it and the corrections needed.

### trust
- `20261118-evolution-of-trust` — **The Evolution of Trust (Nicky Case) — what it shows** — `topics/trust/evolution-of-trust.md` — Faithful chapter-by-chapter summary of Nicky Case's interactive game on the game theory of trust, with its numbers, characters and conclusions.
- `20261118-trust-archetypes` — **Characters as participant archetypes** — `topics/trust/trust-archetypes.md` — Case's characters (Copycat, Always Cheat, Detective, Grudger, Copykitten…) mapped onto SO participants, for abuse-case thinking, onboarding and storytelling.
- `20261118-trust-conditions-in-so` — **The three conditions of trust in Social Organizer** — `topics/trust/trust-conditions-in-so.md` — How each SO mechanic supports (or would break) the three conditions under which trust evolves — repeat interactions, win-wins, low miscommunication — and why SO changes the game instead of policing players.

### audiences
- `20261118-audiences` — **Audiences and what each needs to hear** — `topics/audiences/audiences.md` — The five audiences of the packaging work (future participants, community leaders and influencers, like-minded builders, donors, press and regulators), their main question, the answer, and which material serves each.
- `20261118-cold-start-influencers` — **Cold start through community leaders — pilot plan (brainstorm)** — `topics/audiences/cold-start-influencers.md` — Why cold e-mails failed and community leaders who carry mutual-aid traditions may work instead; the regions and traditions; candidate authors and media (unverified, not contacted); the pilot plan and what to measure.
- `20261118-comparables` — **Comparables — what to learn from other products and traditions** — `topics/audiences/comparables.md` — Products and traditions to study for packaging SO (Splitwise, Signal, Olio, Partiful, GoFundMe, Kickstarter, Patreon, China's mutual aid platforms, ROSCA traditions, Nicky Case's explorables): what each does well and how to apply it without copying what SO is not.

### funding
- `20261118-funding-strategy` — **Funding strategy — what we ask donors to fund (brainstorm)** — `topics/funding/funding-strategy.md` — The brainstorm's funding frame ("Financing a social innovation" chat): fund the deployment and empirical test of an existing social innovation, not an app; a preliminary [figure removed] model; candidate funders to research; the independence condition; institutional funding vs personal patronage. Ideas, not decisions.

### future
- `20261118-direct-cooperation` — **Direct cooperation — the natural continuation (next stage)** — `topics/future/direct-cooperation.md` — Andrei Lubalin's reasoning (2026-11-17) on why direct cooperation grows out of mutual risk sharing — finding partners in the graph, the €5,000 failed-deal example, no central arbiter — and the precision limits.
- `20261118-parked-topics` — **Parked topics — not part of the current story** — `topics/future/parked-topics.md` — Topics deliberately kept out of the current video, landing and onboarding (mutual offset of obligations, initiatives, AI agents, non-monetary Needs) and why.

### packaging
- `20261118-how-it-works-video-idea` — **Idea — a "How It Works" video (from the brainstorm, not started)** — `topics/packaging/how-it-works-video-idea.md` — The brainstorm's proposal for a 2–3 minute practical video complementing the published "Direct Mutual Support Through Real Connections" — its plot, principle and scope — recorded as an idea; no task has been given.
- `20261118-landing-concepts` — **Landing concepts from the brainstorm (not decided)** — `topics/packaging/landing-concepts.md` — Two brainstorm proposals for the new landing — "The World Is Already Connected" (five scenes around the real 3D graph in a demo mode) and the "one life situation, three moving steps" first screen from the landing-references chat — with the corrections they need against the live app and our rules.
- `20261118-packaging-plan` — **Packaging plan — from the data pool to the landing and in-app teaching** — `topics/packaging/packaging-plan.md` — The agreed order of the packaging work (collect the pool → distil what matters → redesign the landing and web → in-app teaching) and which project and installed skills serve each stage.

### meta
- `20261118-open-questions` — **Open questions and findings** — `topics/meta/open-questions.md` — Questions the team needs to answer before the distillation, landing and funding steps, plus product gaps and bugs found while checking the live app on 2026-11-18.
- `20261118-sources` — **Sources of the pool** — `topics/meta/sources.md` — Where every part of this knowledge base came from (Lubalin's research report, three brainstorm chats, Andrei Lubalin's messages, Nicky Case's game, repository documents, the code check), with dates and what is still missing.
