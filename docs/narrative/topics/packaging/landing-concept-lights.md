---
id: 20261118-landing-concept-lights
title: Landing concept "The network that is already there" (proposal)
tags: [packaging, mechanics, trust]
created: 2026-11-18
updated: 2026-11-19
related: [20261118-landing-concept-flock, 20261118-core-message, 20261118-landing-concepts, 20261118-latent-connectedness, 20261118-evolution-of-trust, 20261118-need-protocol, 20261118-packaging-plan, 20261118-audiences]
summary: A new landing concept after the user rejected both chat concepts — the network shown as light that is already there, two layers (life on video, the network as a graph), the visitor inside Maria's 48-hour story with one honest decision, a role flip and the next stage — with the analysis behind it, the screen plan, the visual system, the tech, a Higgsfield shot list and the open decisions.
---

# Landing concept "The network that is already there" (proposal)

> **Note (2026-11-19):** the example story changed from a broken-down car to a job loss; this note is historical, the current scene is in [the core message](../core/core-message.md), section 3.

> Summary: A new landing concept after the user rejected both chat concepts — the network shown as light that is already there, two layers (life on video, the network as a graph), the visitor inside Maria's 48-hour story with one honest decision, a role flip and the next stage — with the analysis behind it, the screen plan, the visual system, the tech, a Higgsfield shot list and the open decisions.

## Context

On 2026-11-18 the user rejected both concepts from the chats ([landing concepts](landing-concepts.md)) and
asked for something new, made with the design skills and the narrative: closer to concept A (the
network as the hero), with storytelling and examples, possibly 3D and Higgsfield graphics or video.
**Status: rejected by the user ("a bit banal"); superseded by [the flock and the seed](landing-concept-flock.md).** Work so far: brief, references, direction
(`ui-design-workflow` steps 1–3, lead skill `design-taste-frontend`); no build. All Russian copy was
written first and checked by an editor subagent; the English follows at build time.

## Details

### 1. What the fresh data says (analysis → consequence for the page)

| Finding | Source | Consequence |
|---|---|---|
| The message is accepted: «Мир теснее, чем кажется», the Maria scene, five beats, «Помощь по доллару только начало» | [core message](../core/core-message.md) | The page stages an existing script; it adds no new claims. |
| A cold reader took Participation for a payment, "one person per dollar" for "300 people give $1", the access rule for recruiting | core message §13 | Show, don't state: people are dots, Participation is a reversible gesture, "not this time" is a real option, the access rule stays in the app. |
| The network already exists; SO activates it. Refusal carries no consequence | [latent connectedness](../theory/latent-connectedness.md), [invitational coordination](../theory/invitational-coordination.md) | The central visual act is **lights turning on along connections that were already there**, not building something new. |
| Trust grows with repeat interactions, win-wins, low noise; Case teaches by "predict, act, see" | [evolution of trust](../trust/evolution-of-trust.md) | A prediction first, one decision, consequences over time, and a role flip (the repeated game). |
| The Pudding, *The Real Kevin Bacon* (2026): the same dots persist and re-arrange (graph → rows by distance); a stepper with progress, prev/next and keys; a text card over the graph; the path lit | reference, studied 2026-11-18 | **Each dot is one person from the first frame to the last**; the story is a stepper inside one section, not scroll-jacking. |
| Nicky Case: the network is made of little characters around the title | reference | The nearest people get faces and names (Maria, Oleg, Lena, you); the far rings stay as light. |
| The user: both chat concepts look conventional; closer to A; storytelling and examples matter | user, 2026-11-18 | Network as hero plus one human story told through it, with life footage. |
| Communities with mutual-aid traditions in Kenya, South Africa, Mexico and Brazil are among the audiences; the app ships in 28 languages. Low-end phones and slow connections are an assumption, not measured | [audiences](../audiences/audiences.md); root `README.md` (i18n) | A light first screen (poster, Canvas 2D), video only on demand or on fast connections, no text inside images or video. |
| The protocol: up to N people, waves every 12 h (Emergency), Need pauses at the amount, no live push, chat in any messenger | [need protocol](../mechanics/need-protocol.md) | The story uses exactly these rules and numbers (300, 210 of 300, 90 more people, 12 hours). |
| Decision 2026-11-10: no numbers on people's circles | launch-readiness | Progress shown as people lighting up, not a money bar on the hero; sums only on Maria's card and on yours. |
| Existing assets: `heroGraph.ts` (Canvas 2D, about 90 fake people, 0.2 ms a frame, no Three.js), `@so/graph-3d`, the dark scene palette, Manrope | README, design system | Extend the canvas engine into a story engine; keep the brand. |

### 2. The idea

**The network is light that is already there.** People are points of light; the connections exist in
the dark. Confirming an acquaintance lights a line. A Need is a warm pulse that travels outward,
nearest first. Participation answers as people lighting up. The page moves between two layers:

- **Life**: short cinematic footage (an evening district with windows lighting up, a car with hazard
  lights in the rain, a morning kitchen, a garage door), people mostly in silhouette.
- **The network**: the graph of lights, drawn by the site's own canvas engine.

The match cut between them is the signature: the lit windows of the city become the nodes of the
graph. That is the project's theory in one image: the connections were already there.

The visitor is a character, "you", inside Maria's story, and makes one real decision.

### 3. The screens (one section per screen)

| # | Section | What the visitor does and sees | Copy (RU, edited) |
|---|---|---|---|
| 1 | **Hero** | Evening district on video (poster on slow connections); over it, lit windows join into lines and become nodes. Enters once on load. | «Мир теснее, чем кажется.» / «Значит, риск одного человека могут разделить многие люди, связанные с ним цепочкой знакомств.» Buttons «Пройти историю Марии», «Собрать свою сеть». |
| 2 | **Guess** (Case's bet) | Picks 1 / 3 / 10 / 100; a path of dots runs from "you" to a stranger. | «Как думаете, сколько человек в среднем отделяет вас от случайного незнакомца?» → «Около трёх с половиной. Столько насчитали исследователи Facebook в 2016 году, изучив связи 1,59 миллиарда человек.» |
| 3 | **Maria's story** (the one big scene; a stepper with progress, prev/next, keys, swipe; 3–4 screens tall) | Time stamps lead. Life frames dissolve into the network. | Chip «Пример». 21:40 «У Марии сломалась машина…»; 21:42 «Мария сообщает о потребности: пишет, сколько нужно, и прикладывает ссылку на чат. Уведомление получат до 300 человек, сначала ближайшие.»; 21:50 «Среди них и вы. Марию вы не знаете, но знаете Олега, а он знает её.» |
| 3a | **Your decision** (inside the scene) | «Что вы сделаете?» → «Спросить Олега» (a chat exchange), «Назвать сумму» (1 / 5 / 15 $, the real Participation form as live HTML), «Не в этот раз». | Oleg: «Да, Машу знаю, всё так. Она на работу на машине ездит, автобусы туда не ходят.» / «Это намерение, а не платёж. Пока потребность открыта, вы можете изменить сумму или отозвать участие.» / «Так тоже можно. Участвовать или нет, каждый решает сам.» |
| 3b | **Time** | 09:45 next morning: a second wave reaches new people further out. | «Прошло 12 часов, участники заявили 210 долларов из 300. Потребность уходит дальше: её получат ещё 90 человек, по одному на каждый недостающий доллар.» (the visitor's own amount is counted in the 210) |
| 3c | **People agree** | The participants' chat, messenger-neutral. | Lena: «Маш, у меня знакомый мастер, возьмёт дешевле. Скинуть номер?»; «Мария обсуждает ремонт с участниками в чате. Деньги они передают ей сами, кто как привык.»; two days later Maria: «Всё, снова на колёсах! Спасибо всем, а Лене отдельное спасибо за мастера!»; «Приложение сохранит эту историю. В ней только факты: никто никого не оценивает.» |
| 4 | **Role flip** | The camera moves to your node; your own circle lights around you. | «Завтра на месте автора можете оказаться вы.» / «Сеть собирают заранее. В трудный день на это нет ни времени, ни сил.» + three reasons (free; only people you know; nobody earns from invites). Button «Собрать свою сеть». |
| 5 | **Next** (labelled «Дальше») | From Lena's tip, new kinds of lines run across the same network. | «Помощь по доллару только начало. Мы хотим, чтобы со временем через сеть знакомств люди находили мастера по рекомендации, партнёров для общего проекта, единомышленников для своей инициативы. И договаривались, как и сейчас, напрямую.» |
| 6 | **Proof and questions** | Three facts set large, then the newcomer's questions and "what it is not" as an accordion. | 4,57 рукопожатия (2016) · с одного человека примерно до 300 · ноль комиссий; core message §6 and §9. |
| 7 | **Door for builders and donors** | Quiet, separate: the theory, the open code, support for the project. | Core message §10 lines; links to Lubalin's report and GitHub. |

### 4. Visual system (built on the existing tokens)

- Ground: `scene` / `scene-2` (always dark) for sections 1–5; `canvas` / `surface` for 6–7 (one
  contrast change).
- Light roles: `warm` (#f2be68) = a Need, Maria, the window light; `care-scene` (#5fd3c6) =
  confirmed connections and Participation; `node-1…3` = people by ring; you = `node-1` with a halo.
- Type: Manrope; time stamps 800 weight, tabular numerals, in `warm`.
- People: the nearest nodes carry faces (photos or drawn portraits, to decide) and names; rings 2–3
  stay as light, so a crowd never becomes faces of strangers.
- No money bar in the hero or on people; the Meter appears only inside the real app screen.
- Real UI: the Need page with the chain and the Participation form rendered as live HTML from the
  app's own components, not screenshots (the `design-taste-frontend` rule for software pages).

### 5. Tech and performance

- One canvas story engine extended from `components/site/heroGraph.ts`: scripted states per step,
  people as persistent dots that move between layouts (Pudding-style), the window-to-node match cut
  over the video frame. No Three.js on the landing (keeps the bundle and the 0.2 ms budget).
- Video: 720p, 4–8 s seamless loops, AVIF poster frames; plays only when `saveData` is off and the
  connection is fast; otherwise posters. Tap to play in the story on phones.
- The story is a stepper (buttons, ←/→, swipe); scrolling never drives it. Reduced motion: static
  frames with the same text. Every step works without video.
- All text in HTML and i18n keys (28 languages); no text inside images or video.
- Budget for the first screen: under about 1.2 MB with the poster; the canvas pauses off-screen.

### 6. Higgsfield shot list (to approve before generating; it spends credits)

Higgsfield CLI is installed and signed in; a workspace must be selected first
(`higgsfield workspace set <id>`). Defaults from the skill: GPT Image 2.6 for stills, Seedance 2.5
for video. Each shot: no text, no logos, no readable plates, no identifiable faces, neutral
neighbourhood that could be in Nairobi, Johannesburg or São Paulo.

| # | Shot | Use | Format |
|---|---|---|---|
| H1 | Dusk over a dense mid-rise residential district; warm lights switch on in windows one by one; slow push-in; light haze | Hero loop + match cut | 8 s seamless, 16:9 and 9:16 + poster |
| H2 | Rainy night street; a small hatchback at the curb with hazard lights blinking; a woman in silhouette holding a phone | Story 21:40 | 5 s + poster |
| H3 | Morning kitchen by a window; a phone on the table glows softly; steam from a cup; hands only | Story 09:45 | 5 s + poster |
| H4 | A garage door in late-afternoon light; two people shake hands, faces out of focus | Story, Lena's mechanic; the "next" section | 5 s + poster |
| H5 | The hatchback pulls away from the garage at sunrise | Story, two days later | 4 s + poster |

Later: regional versions of H1–H5 for the community leaders' kits (the same story in their streets).
These are illustrations; they are never presented as real participants.

### 7. Why this is not concept A again

Concept A put the network in the hero and then listed scenes. Here the network is the stage of one
human story with a beginning, a decision, time and an ending; the visitor plays a part; real life and
the network are two layers of the same picture; and the next stage grows out of the story itself.

### 8. Open decisions (for the user)

1. Go ahead with this concept (or adjust it).
2. Higgsfield: approve the shot list and select the workspace; the cost is shown before generation.
3. Faces of the nearest people: drawn portraits or photographs (real people with consent, or none).

## Related
- [The core message](../core/core-message.md) — source: all copy.
- [Landing concepts](landing-concepts.md) — the rejected concepts A and B.
- [Latent connectedness](../theory/latent-connectedness.md) — source: the central image.
- [The Evolution of Trust](../trust/evolution-of-trust.md) — source: the teaching moves.
- [The Need protocol](../mechanics/need-protocol.md) — constrains: every number in the story.
- [Packaging plan](packaging-plan.md) — parent: stage 3.
- [Audiences](../audiences/audiences.md) — use: regional versions (the community traditions).
