---
id: 20261118-landing-concept-flock
title: Landing concept "The flock and the seed" (prototype)
tags: [packaging, mechanics, core]
created: 2026-11-18
updated: 2026-11-18
related: [20261118-core-message, 20261118-need-protocol, 20261118-claims, 20261118-vocabulary, 20261118-latent-connectedness, 20261118-autocatalytic-law, 20261118-landing-concept-lights, 20261118-landing-concepts, 20261118-packaging-plan]
summary: The landing concept the user chose on 2026-11-18 — a starling flock (no leader, each bird watches a few neighbours, a wave passes neighbour to neighbour) as the picture of the network and frost growing from one seed as the picture of growth past a threshold, with the process itself explained plainly — as a ten-screen landing plan, the final Russian copy, two code interactives, the generated media and how to port it into apps/web.
---

# Landing concept "The flock and the seed" (prototype)

> Summary: The landing concept the user chose on 2026-11-18 — a starling flock (no leader, each bird watches a few neighbours, a wave passes neighbour to neighbour) as the picture of the network and frost growing from one seed as the picture of growth past a threshold, with the process itself explained plainly — as a ten-screen landing plan, the final Russian copy, two code interactives, the generated media and how to port it into apps/web.

## Context

After six rejected directions (chat concepts A/B, night-city lights, ink hands with an envelope, a
paper diorama, a glass ball in a cotton net, warm photographs of smiling people; see
[the lights concept](landing-concept-lights.md) and [landing concepts](landing-concepts.md)), the user
asked for a metaphorical approach drawn from this knowledge base. Of three metaphors shown as key
visuals (starling murmuration, frost from one seed, mycelium), the user chose two:

> «Стая и затравка хорошо как метафоры, так же нужно включить краткое объяснение самого процесса, и
> что люди в сети помогают друг другу решать проблемы в составе координированной сети. Сильно в
> метафоры уходить не надо» (2026-11-18), and: «это потом всё надо собрать в логичный лендинг сайт»;
> «наш лендинг очень плох, нам нужно полностью его переделать и не опирайся на него сильно».

Mycelium was dropped: the "wood wide web" image is worn out, and the claim that trees feed each other
through fungi is disputed by researchers.

**Status: prototype, waiting for the user.** Prototype (git-excluded):
`local/media/concept-6/prototype/index.html` in the main checkout; open it in a browser.

## Details

### 1. The idea in one paragraph

Nature already shows the two halves of the mechanism. A starling flock has no leader: each bird
watches only six or seven nearest neighbours (Ballerini et al., PNAS 2008, "topological
interaction"), yet thousands move as one, and a turn passes neighbour to neighbour as a wave. That is
the network: everyone acts in their own circle, there is no centre, and one person's trouble reaches
the nearest first. Frost starts from one point and then grows by itself, every branch making new
ones. That is how the network grows past a threshold (the [conditional law](../theory/autocatalytic-law.md),
in public words). The metaphors are the **visual language only**; every claim on the page is said
literally, in the words of the [core message](../core/core-message.md). On the page, the flock
becomes the network: the five steps of a Need play out on a live flock in which every bird is a person.

### 2. The page, screen by screen

| # | Section (id) | Job | Picture | Interaction |
|---|---|---|---|---|
| 1 | Hero (`top`) | The premise: the world is small, so risk can be shared | Murmuration at dusk (photo, later a silent loop) | Enter animation, two buttons |
| 2 | What the network is (`network`) | No centre, everyone in their own circle → a network where people solve problems together | Close-up of starlings, photo on the right | Hover zoom |
| 3 | How it works (`how`) | The process in five steps (Maria's Need) + "tomorrow it could be you" | **Live flock (Three.js)**: each bird is a person | Native scroll drives the steps; click a bird to start a wave |
| 4 | Together (`together`) | People coordinate, not only with money: amount, advice, someone who knows the author | Murmuration with a dark wave passing through it (photo) | Example timeline in four moments |
| 5 | Why believe it (`trust`) | Proof | Type moment: «4,57» | — |
| 6 | How it grows (`grow`) | From one person; above one newcomer per person the network grows by itself | **Frost growth (canvas)** | Four values 0.5 / 1 / 1.5 / 2, click to plant a seed |
| 7 | Next (`next`) | Help by the dollar is the first stage (labelled «Дальше») | Frost over a whole pane at dawn (photo band) | Hover zoom |
| 8 | Donors (`donors`) | The ask for donors and researchers | Frost from one amber seed (photo) | Two buttons |
| 9 | FAQ (`faq`) | Accepted answers, including "is it insurance or a fund" | — | `details` |
| 10 | Final (`start`) | Why join now: build the network before you need it | Murmuration, mirrored and darkened | Main button |

### 3. The flock scene (section 3)

- About 1,500 boids on desktop, 700 on phones (separation, alignment, cohesion over at most nine
  neighbours, a slowly moving attractor with a swirl). Birds are small instanced chevrons with a
  wing flap, dark on a dusk gradient that echoes the photographs.
- When the story starts, a fixed "acquaintance graph" is snapshotted: each bird's seven nearest
  birds, made mutual. Maria is the bird nearest the flock's centre; "you" are two handshakes from
  her; Oleg is the link between you.
- States by step: 0 free flock, a wave every few seconds until someone clicks a bird; 1 you, your
  acquaintances and lines to them; 2 Maria's Need reaches up to 300 birds in breadth-first order
  (nearest first), with the counter «узнали о потребности»; 3 the chain you → Oleg → Maria;
  4 about one in seven of those reached report Participation (amber), the rest dim back with no
  consequence, «заявлено из 300 долларов» counts to 300; 5 participants' lines to Maria (the chat),
  Lena's label; 6 a wave starts from you.
- Words in the counters follow the app (`заявлено`, not `названо` or `собрано`).

### 4. The frost model (section 6)

A branching process drawn as frost: six branches start from the seed; each branch grows a random
length, then ends in Poisson(R) new branches, where R is the chosen "new people each person brings";
crowded cells stop growth. Below 1 the pattern dies out («Рост затих»), above 1 it fills the screen
(«Сеть растёт сама»). The note under the control says it is a simplified model: circles overlap and
nobody has to invite anyone. Never show it as a forecast.

### 5. Final Russian copy (edited, project rules applied)

Written as original Russian, then checked by a separate editor pass (2026-11-18). Kept against the
editor: «заявлено» (the app's word), «приложение к деньгам не прикасается» («денег не касается» reads
as "is not about money"), the accepted hero line and the accepted donor ask («Профинансируйте…»).

| Key (`landing.v2.*`) | RU |
|---|---|
| hero.title | Мир теснее, чем кажется. |
| hero.lead | Между двумя случайными пользователями Facebook в среднем меньше четырёх человек. Значит, риск одного человека могут разделить многие люди, связанные с ним цепочкой знакомств. |
| hero.cta / hero.how | Собрать свою сеть / Как это работает |
| hero.facts | Бесплатно · без комиссий · деньги через приложение не проходят |
| flock.title | Стая без вожака |
| flock.p1 | В стае скворцов нет главного. Каждая птица следит только за шестью-семью ближайшими соседями, и всё же тысячи птиц летят как одно целое. Если одна резко свернёт, это заметят её соседи, потом их соседи, и по стае пройдёт волна. |
| flock.p2 | Люди связаны так же. Вы знаете своих, они знают своих, и через несколько рукопожатий оказываются связаны почти все. В Social Organizer из этих знакомств складывается сеть, где люди вместе решают проблемы друг друга. |
| how.title / how.hint | Как это работает / Нажмите на любую птицу, и от неё пойдёт волна. |
| how.s1 | **Сеть из знакомых.** Вы приглашаете человека, которого знаете лично, и вы оба подтверждаете знакомство. Потом он приглашает своих. |
| how.s2 | **Сообщение о потребности.** У Марии сломалась машина, ремонт стоит 300 долларов. Она сообщает о потребности и оставляет ссылку на чат. О ней узнают до 300 человек: сначала её знакомые, потом их знакомые. |
| how.s3 | **Каждый решает сам.** Вы видите, через кого связаны с Марией: вы знаете Олега, а Олег знает Марию. Вы можете расспросить Олега, что случилось. Участвовать или нет, решаете вы. |
| how.s4 | **Понемногу от многих.** Кто готов участвовать, сообщает об участии и называет сумму от одного доллара. Вы называете 5 долларов. Это намерение, а не платёж: пока потребность открыта, вы можете изменить сумму или отозвать участие. |
| how.s5 | **Договариваются напрямую.** Мария и участники обсуждают всё в чате. Лена советует мастерскую подешевле. Если речь о деньгах, люди передают их сами: приложение к деньгам не прикасается. |
| how.s6 | **Завтра на месте Марии можете оказаться вы.** |
| how.reached / how.reported | узнали о потребности / заявлено из 300 долларов |
| together.title | Сообща справиться легче |
| together.text | Потребность собирает вокруг человека тех, кто может помочь. Один называет сумму, другой знает хорошую мастерскую, третий лично знает Марию и может рассказать, что случилось. Никто не командует, и никого не заставляют: каждый сам решает, чем помочь, а договариваются люди напрямую, в чате. |
| together.t1–t4 | **Вечер.** Мария сообщает о потребности: 300 долларов на ремонт машины. / **Через час.** Вы спрашиваете Олега, что случилось, и называете 5 долларов. / **Тем же вечером.** Лена в чате советует мастерскую подешевле. / **Через два дня.** Мария пишет, что машина снова на ходу. |
| trust.bigNote | 4,57 рукопожатия в среднем разделяли двух случайных пользователей Facebook в 2016 году. В 2011-м было 4,74. |
| trust.title | Почему этому можно верить |
| trust.f1 | **Только те, кого вы знаете.** В свой круг вы добавляете только тех, кого знаете лично, и вы оба подтверждаете знакомство. |
| trust.f2 | **Это работает не только на бумаге.** Сеть выросла с одного человека примерно до 300, и люди в ней уже выручали друг друга. |
| trust.f3 | **Посредников нет.** Деньги через приложение не проходят, комиссий нет, код открыт. |
| grow.title | Сеть растёт с одного человека |
| grow.p1 | Иней на стекле начинается с одной точки, а дальше растёт сам: каждая веточка даёт новые. Сеть Social Organizer тоже началась с одного человека, и к ноябрю 2026 года в ней около 300 человек. |
| grow.p2 | Каждый приглашает тех, кого знает лично. Если в среднем каждый приводит больше одного нового человека, сеть растёт сама. Если меньше, рост затихает. |
| grow.q / restart / note | Сколько новых людей в среднем приводит каждый / Начать заново / Это упрощённая модель: в жизни круги знакомых пересекаются, а приглашать никто не обязан. |
| grow.dies / grows | Рост затих / Сеть растёт сама |
| next.label / title | Дальше / Помощь по доллару: только начало |
| next.text | Мы хотим, чтобы со временем через сеть знакомых люди находили мастера по рекомендации, партнёров для общего проекта, единомышленников для своей инициативы. И договаривались, как и сейчас, напрямую. |
| donor.label / title | Для доноров и исследователей / Приложение и теория уже есть |
| donor.text | Осталось испытать их на практике. Профинансируйте запуск в сообществах и исследование, которое проверит, может ли сеть расти сама. |
| donor.cta / theory | Поддержать проект / Прочитать теорию |
| faq | Five accepted questions: why now; who makes sure people keep their word; is Participation a payment; does the app take a cut; is it insurance or a fund (answers from the core message, sections 5, 6 and 9). |
| final.title / text / cta | Сеть собирают заранее / В трудный день на это нет ни времени, ни сил. Добавьте тех, кого знаете лично. / Собрать свою сеть |

### 6. Visual system

- Palette from the photographs: dusk slate (`#141c26` → `#8496ab`), mist `#c8d2dd`, paper `#eef1f4`,
  one accent amber `#eba24a` (the warm horizon band; in the scene it marks a Need and Participation),
  frost `#dde5ee` on near-black.
- Type: Spectral (serif, Cyrillic) for headings and numbers, Manrope for text.
- Photography: restrained fine-art and scientific photography, no people, no text, no money; every
  generated image is labelled as generated in the footer.
- Motion: one hero entrance, hover lifts and zooms, the two interactives; `prefers-reduced-motion`
  stops the flock and draws the frost at once.

### 7. Media (generated, git-excluded drafts in `local/media/concept-6/`)

| File | Tool | Used in |
|---|---|---|
| `murmuration-v1.png` | Codex image generation | Hero, final |
| `starlings-close-v1.png` | Codex | Section 2 |
| `murmuration-wave-v1.png` | Codex | Section 4 |
| `crystal-v1.png` | Codex | Section 8 |
| `frost-dawn-v1.png` | Codex | Section 7 |
| `murmuration-loop-raw.mp4` | Grok Imagine (image to video) | Hero loop, after the ffmpeg loop recipe in `so-media` |
| `mycelium-v1.png` | Codex | Dropped |

Exact prompts sit next to each file as `*.prompt.txt`.

### 8. Porting into apps/web (stage 3)

- Replace `LandingPage.tsx` wholesale; keep only the shell (`SitePage` meta, `SiteHeader`,
  `SiteFooter`, store buttons) and the routes `/how` and `/sos/:id`.
- Each section is a component; the copy moves to `packages/i18n/locales/*.json` under `landing.v2`
  (keys are already named in the prototype's `data-i18n`), then translated into the 28 languages.
- The flock and the frost are lazy chunks (Three.js only for section 3), paused off screen;
  phones get fewer birds; the hero uses a poster still and an H.264/WebM loop under 2 MB.
- Use the real, translated app strings in the step cards where they exist, and the live network
  count from the API in place of «около 300» once it is honest to show.
- The design-token lint runs only in the web production build: build before pushing.

### 9. Open decisions

- Hero: the still or the Grok loop (depends on how the loop looks).
- Where «Поддержать проект» and «Прочитать теорию» lead (a donor page, Lubalin's report).
- The English version is written as its own text, not translated.
- Whether to show real app screens next to the step cards (live components, never mock-ups).

## Related
- [The core message](../core/core-message.md) — source: every line on the page.
- [The Need protocol](../mechanics/need-protocol.md) — evidence: up to N people, nearest first, from $1, reversible, the chat.
- [Claims](../principles/claims.md), [vocabulary](../principles/vocabulary.md) — constrain: the copy and the frost model's wording.
- [Latent connectedness](../theory/latent-connectedness.md), [the conditional law](../theory/autocatalytic-law.md) — source: the two metaphors.
- [Landing concept "lights"](landing-concept-lights.md), [landing concepts](landing-concepts.md) — earlier, rejected directions.
- [Packaging plan](packaging-plan.md) — parent: stage 3.
