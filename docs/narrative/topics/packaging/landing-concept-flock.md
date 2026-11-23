---
id: 20261118-landing-concept-flock
title: Landing concept "The flock and the seed" (prototype)
tags: [packaging, mechanics, core]
created: 2026-11-18
updated: 2026-11-19
related: [20261118-core-message, 20261118-need-protocol, 20261118-claims, 20261118-vocabulary, 20261118-latent-connectedness, 20261118-autocatalytic-law, 20261118-landing-concept-lights, 20261118-landing-concepts, 20261118-packaging-plan]
summary: The landing concept the user chose on 2026-11-18 — a starling flock (no leader, each bird watches a few neighbours, a wave passes neighbour to neighbour) as the picture of the network and frost growing from one seed as the picture of growth past a threshold, with the process itself explained plainly — as a ten-screen landing plan, the final Russian copy, two code interactives, the generated media and how to port it into apps/web.
---

# Landing concept "The flock and the seed" (prototype)

> **Note (2026-11-19):** the example story changed from a broken-down car to a job loss; this note is historical, the current scene is in [the core message](../core/core-message.md), section 3.

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

**Status: live on the site since 2026-11-18 (section 18), in all 28 app languages.** Sections 10 to 16
below supersede the screen plan, the flock scene, the copy and the visual system of v1 (sections 2, 3,
5 and 6). The prototype stays as a reference (git-excluded): `local/media/concept-6/prototype/index.html`
in the main checkout.

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

### 10. Prototype v2 (2026-11-18): why and what changed

The user reviewed v1 in the browser: "очень слабо как лендинг"; the 3D flock "не информативна и
только отвлекает (постоянно кружа по экрану)"; fonts and typography disliked; texts "отвратительные,
очень AI slop"; birds standing still are also wrong ("движение должно быть, но при скролле история
продолжается"); and the palette came from the photographs instead of the brand, with a drawn mark
instead of the app's logo.

- **One scroll-told scene.** A fixed WebGL layer over a photographed sky plate (Codex,
  `sky-plate-v1.png`, no birds) runs behind nine beats: the opening ribbon of the murmuration; one
  bird and its seven neighbours; handshake rings spreading from it (the model's real counts); you and
  your circle; Maria's Need reaching up to 300 birds nearest first; the chain you, Oleg, Maria;
  Participation adding up to 300 dollars; the participants' chat; the next Need starting from you.
- **Motion that does not distract.** The flock never wanders: the shape breathes with a slow,
  low-frequency wave, each bird flaps and bobs, and the neighbour graph stays fixed, so lines and
  labels stay readable. Only scrolling moves the camera and advances the story; counters and the
  wave are scrubbed by scroll. Birds nearer than half the shot distance are clipped so nothing
  crosses the text. About 6,500 instanced birds on desktop, 2,400 on phones, 3 ms a frame.
- **Brand.** The app's logo (`apps/web/public/logo*.png`) and tokens (`apps/web/src/styles/tokens.css`):
  scene #0b1513, care #087f71 (Participation, main buttons), sos #c5342c (a Need), warm #f2be68 (those
  who heard of it), ring nodes #e7eeeb / #9fb0aa / #5f7069. The sky is graded towards the scene colour
  and darkens into night as the story goes on.
- **Type.** Onest (a Cyrillic-first grotesk) for display and text, JetBrains Mono for labels and
  numbers. The app itself uses Manrope: decide whether the site follows the app or the app follows.
- **Copy.** Rewritten as one evening's story in the second person, then edited against the stop-slop
  rules and the project rules (key: `window.COPY` in the prototype). Kept against the editor: «через
  приложение не проходят», «узнают до 300 человек», «приложение к ним не прикасается», «может
  понадобиться». The separate "Together" section is gone: the story now carries coordination (Oleg
  vouches, Lena finds a cheaper garage, the chat).
- **After the story:** facts (4,57), how the network grows (the frost model), next stage, donors,
  FAQ, final call.

### 11. Prototype v3 (2026-11-18)

The user: the birds are "явный прогресс"; make the growth screen more interesting, clear and
interactive; remove or rework the frost-on-glass picture; animate the FAQ; smooth the moves between
steps and finish the scroll for the reader at some moments; then review and improve the site.

- **Growth model** replaces the frost: one warm seed person; each newcomer invites Poisson(R)
  acquaintances (a slider from 0,5 to 2,5, the track red below the threshold 1 and care-teal above);
  the chance that an invitation reaches someone already in the network grows with the network
  (circles overlap, drawn as a short dashed warm line), so growth slows and stops when the model
  runs out of new people. Newcomers fly in from the person who invited them; live counts (people,
  waves) and a small chart of people per wave; a click anywhere restarts from that point.
  Outcomes: «Рост остановился», «Сеть растёт сама», «Новых людей в модели больше нет».
- **Frost photographs removed.** "Next" shows the signals as a small diagram: now, a Need and
  Participation (solid, a warm pulse runs from one to the other); later, recommended tradespeople
  and joint projects (dashed). Donors take the starling close-up.
- **FAQ** answers open and close with a height animation; the icon turns at once.
- **Smoother story:** shots blend over the first 62 % of a beat with an ease-in-out, and a damped
  follow on the camera removes the kinks between shots; native `scroll-snap-type: y proximity` with
  one snap point per beat at the moment the beat is fully told (0,62 / 0,85 / 0,55 / 0,8 / 0,6 / 0,78
  / 0,6 / 0,82 of its height), so the page finishes the scroll only when the reader stops near it.
- **Review fixes:** a chapter rail on the right (Стая · Люди · Сеть · Потребность · Решение ·
  Участие · Чат · Вы; click jumps to the snap point); the 4,57 moment counts down from 4,74 (2011)
  to 4,57 (2016); a soft hand-over from the dark story to the light sections; on phones the scene
  keeps the top of the screen and the beat's words sit in a card pinned to the bottom.

### 12. Prototype v4 (2026-11-18): scrolling, copy, growth layout

- **Scroll.** The user: the steps were "fixed in the wrong places". Cause: the rest points sat at
  0,6–0,85 of a beat (where its animation ended), while the beat's words sit in its middle, so at
  rest the text slid under the header. Now every beat rests at its middle and finishes its
  animation before it (camera by 0,42, reveals by about 0,45). Native `scroll-snap` (proximity)
  stopped at random places, so a scripted finish replaced it: when the reader stops inside the
  story, the page glides to the next beat's middle in the direction of the scroll, or back if they
  moved less than 16 % of the screen; wheel, touch or key cancels; after the last beat the story
  lets go. Tested with real wheel input and scripted runs on 1440×900 and 390×844 (forward, small
  nudges, back, a long fling, leaving the story); screenshots of all nine rest points on both.
- **Copy.** The user: the first screen should not open with Facebook and "fewer than four people";
  the texts were still odd and too long. Hero now: «Ваш круг больше, чем кажется.» / «Вы собираете
  сеть из тех, кого знаете лично, и их знакомых. Когда кому-то трудно, первыми об этом узнают
  близкие, а помогает тот, кто захочет.» The Facebook figure stays only as evidence in «Что уже
  есть». Every beat is cut to one thought (for example «Через два-три рукопожатия вы уже никого не
  знаете в лицо.»), the model's ring counts are gone, FAQ answers are shorter. The current lines
  live in `window.COPY` in the prototype.
- **Growth model.** Invitations per person now have a low spread (R = 1,5 means one or two), and the
  first person always invites two, so above the threshold the network never dies by bad luck and
  below it always fades; on phones the words, the model's frame and the controls stack.

### 13. Prototype v5 (2026-11-18): copy from the docs, the app, donors, one font

- **Copy** now comes from the accepted core message (the five beats, Maria's scene, why join now,
  what comes next, the donor line, FAQ and denials), not new prose. Every fact appears once:
  Facebook only in the "people" beat; "free, no fees, open code" only in the hero line; "money never
  goes through the app" only in beat 5; the trust section and the 4,57 moment are gone; FAQ keeps
  only questions the page does not answer elsewhere (who makes sure people keep their word,
  insurance or fund, donation drive, pyramid).
- **The app** closes the page («Сеть собирают заранее»): how to start (open a friend's link or
  sign in and invite the first five), badges with real marks for Google Play
  (`com.socialorganizer.app`), App Store (`id6768132198`), the browser (`/login`) and Telegram
  (`@socialorganizer_bot`), the sign-in methods (Google, Apple, Telegram, e-mail code; no password)
  and a QR to `/get` on desktop. The header has «Войти». No screenshots of the redesigned app exist
  yet; the old store screenshots were not used.
- **Donors** rebuilt as a plain brief on paper: «Приложение и теория уже есть», «Что уже есть»
  (287 people with connections on 13 November 2026; Android, iPhone, browser; Lubalin's report, July
  2026), «На что нужны средства» (launch in communities; research into whether the network grows by
  itself), buttons to the team through the Telegram bot and to the report on Zenodo. The
  fundraising model from the brainstorm stays out: it is not a decision.
- **Next** is a dark live network: a Need runs a few handshakes and Participation answers back;
  dashed sparks are the signals we want later (a recommended tradesperson, a joint project).
- **One font: Manrope**, the app's own. Measured in the browser: x-height 0,75 vs 0,746 (Onest),
  58 vs 56 characters per 540 px line at 18 px, tabular figures in both; no readability difference
  worth changing the app, so the landing follows the app and drops JetBrains Mono.

### 14. Prototype v7 (2026-11-18): the page as one story and one instruction

The page now reads in one line: the promise (hero) → how people are connected (the flock, then
4,57 handshakes with a link to Facebook's study) → the five steps on Maria's example → "tomorrow it
could be you" with the way in → how the network grows (the model) → what comes next (signals now
and later) → donors (what exists, with links; what money is for) → objections (FAQ) → how to start
(three steps, every platform, QR) → footer (GitHub, Telegram, sign-in).

- Every reference is a link: the study, the report on Zenodo, Android, iPhone, the browser, GitHub
  (`element1965/Social-organizer`, public), the team through the Telegram bot.
- Donors and FAQ are dark like the rest of the page; donors are two glass cards over the starling
  photograph.
- The last story beat was empty because of a broken script substitution; it is restored and ends
  on the call to action.
- The sky follows the camera (slides with the yaw and the side offset, sinks as the camera rises,
  closes in on near shots); the colour grade is baked into the image.
- Performance: canvas pixel ratio capped at 1,5; fewer birds on 4-core devices; line buffers
  written in place; the finished growth model and the static part of the "Next" network are not
  redrawn; images decode asynchronously.

### 15. Prototype v8 (2026-11-18): scroll finishing for the whole page

The user: the previous scene pulled the scroll back when leaving the story (and when coming back up);
the finishing had to work on every screen size; the growth model had to start only when the reader
reaches it; the new blocks looked bad on phones.

- The "small nudge returns to the beat" rule caused the pull-back: a trackpad scrolls in short bursts,
  and every pause pulled the page back. Now the page has rest points everywhere (the middle of every
  story beat, the top of every later section, the bottom of a section taller than the screen, and the
  page bottom); when a gesture ends, the page glides to the nearest rest point except the one it rested
  on before the gesture, so it never pulls back; a move under 40 px changes nothing; inside a tall
  section the reader scrolls freely.
- Tested with scripted runs at 1440×900 and 390×844: beat → growth → next and back, a 30 px nudge, a
  trackpad-like run of 25 px steps both ways, the page end (the footer stays reachable); screenshots at
  1440×900, 1280×720, 768×1024 and 390×844.
- The growth model starts when at least 60 % of the model's own frame is on screen and pauses when it
  leaves.

The current landing keeps that visibility rule. It models 30–150 acquaintances per person,
discounts overlapping circles at each handshake, and stops at five handshakes or one million people.
The canvas draws a sample and the chart shows cumulative reach. The prototype versions documented
here use the original growth threshold.

### 16. Prototype v9 (2026-11-18): people for the experiment, not money

The user: «Мы не ищем деньги через сайт, мы больше ищем людей, кто хочет поучаствовать в эксперименте и
помочь рассказать о нём»; the donor blocks were uneven and looked bad, worst on phones; the author is
«Андрей Любалин» in Russian (the report on Zenodo spells him "Lubalin, Andrei", so English keeps Lubalin).

The donor section is replaced by «Присоединяйтесь к эксперименту» (`#join`, header «Участвовать»):
«Приложение и теория уже есть. Теперь их нужно проверить на практике, и для этого нужны люди.», the
287 figure with its date, three numbered ways in the language of the start section (no boxes):
build a network in your community (we help explain it in your people's language), tell others about
the project, help with the research or the code (links to the report and GitHub); buttons «Написать
команде» (the Telegram bot) and «Поделиться» (the system share sheet on phones, a copied link
elsewhere). Money and the fundraising model stay off the site.

### 17. Contact without spam or scam (2026-11-18)

«Написать команде» opens `t.me/socialorganizer_bot?start=team`. The bot then answers with a prompt and
three topic buttons (Сообщество, Рассказать о проекте, Исследование или код), skips the app welcome
and the "never opened the app" reminders, and forwards the person's messages to the support chat
tagged «с лендинга · тема». Forwarding is limited to 5 messages an hour and 20 a day per chat;
`/mute <chatId>` in the support chat silences one sender. The landing and the bot say the same
anti-scam line: «Команда отвечает только из @socialorganizer_bot и никогда не просит деньги, коды
входа или данные карты.» The team answers through the bot (the in-app support reply), never from
personal accounts. Builders and researchers go to GitHub. No public e-mail and no web form.

### 18. In the app, in 28 languages (2026-11-18)

The user: «Дальше делай переводы на все языки, адаптируй, проверь другими моделями тексты (саб агентами)
и выкатывай лендинг в мейн».

- **Code.** `apps/web/src/pages/LandingPage.tsx` renders the page; `components/landing/` holds the
  imperative parts ported from v9 with few changes: `scene.ts` (Three.js, a dynamic import, so signed-in
  users never load it), `glide.ts`, `grow.ts`, `nextNet.ts`, `landing.css` (scoped under `.lv`, dark in
  both app themes, colours as tokens). Everything is disposed on unmount. Header adds the app's language
  chip; on phones under 400 px the brand shows only the logo.
- **Differences from v9.** Scroll finishing glides only in the gesture's direction, and a section under
  1.2 screens has one rest point; the counters are hidden from screen readers; without WebGL all beat
  text shows at once; counter captions agree with their number (i18next plural forms: «3 человека в
  сети», «44 участника», "1 wave of invitations").
- **Copy.** Russian is the original; the English is written as its own text from the core message. The
  other 26 languages: Claude translated each from both, then GPT and Grok reviewed every language
  independently (meaning, grammar after numbers, the app's glossary, badge wording), then a Claude
  editor decided on every finding. Typical real catches: "friends" for acquaintances in the FAQ,
  "supporters" for «единомышленники», a tradesperson "guaranteed" instead of recommended, the Hebrew
  spelling of Lubalin reading as Lublin, a Turkish counter saying people "felt a need". English after
  review: the FAQ says acquaintances, the next section says like-minded people, "Help test the theory or
  work on the app". Decision logs per language: `local/media/concept-6/i18n/reviews/decisions/`
  (git-excluded, main checkout).
- **Rules learned for translated landing copy.** Names of the story stay in the reader's script; money
  is written the way each locale writes dollars; Arabic and Hebrew wrap `@socialorganizer_bot` in a
  left-to-right isolate and keep Social Organizer on one line; Japanese and Chinese headings wrap at
  phrases; every caption after a live number is a plural family.

### 19. From the allegory to the app, local names and sums, phone scrolling (2026-11-18)

The user: «Птицы в 3д сцене к концу должны превращаться в граф, такой же как у нас в приложении, чтобы от
аллегории перейти к реальному применению и виду плавно и фон соответственно должен тоже измениться. Имена
нужно адаптировать под локаль и стоимость ремонта машины тоже (примерно). Сейчас на телефоне можно пролистать
много разделов сразу и пропустить многое… разделы которые не помещаются в экран по высоте тяжело читать».

- **The flock becomes the app's graph.** Beat 8 («Вы») gathers the birds round you onto the app's shells by
  handshake (rings 1 to 3 at 0.38, 0.7 and 1 of the ball, then a dust; the farthest birds leave), each bird
  shrinking into a dot as it arrives; the sky gives way to the app's scene with its centre wash, and you
  become the care tile with the logo. Once the rings have formed, your Need spreads ring by ring to 300
  people: the people you know hear first. A new beat 9 «В приложении» shows the app's view (faint links,
  the care spokes to your acquaintances, the names as app labels) with Maria's Need travelling to you along
  the chain Maria → Oleg → you, pulses and a breathing ring, and carries the call to action. Copy:
  «Так ваша сеть выглядит в приложении: вы в центре, вокруг ваши знакомые, дальше их знакомые.» /
  «Когда кому-то нужна помощь, вы видите цепочку знакомых от этого человека до вас.»
- **Local names.** Each language has its own three people (Russian keeps Мария, Олег, Лена; English Sarah,
  Tom, Emma); translators chose names common in the language's main countries and inflected them.
- **The repair at the reader's price level, in dollars.** A first version converted the sums into local
  currencies; the user corrected it: «Я не просил тебя конвертировать все в валюты, можно было оставить цену в
  $ просто для некоторых стран это большие деньги, а для некоторых на них ничего не сделаешь». Now the sums stay
  in dollars, as the app counts, and the repair follows the price level of the browser's region (the page
  language when it names none) in whole hundreds: $100 India, $200 Ukraine or Thailand, $300 Russia or
  Poland, $400 Italy or Japan, $500 the US or Germany, $600 Norway or Switzerland
  (`components/landing/money.ts`). A Need reaches up to one person per dollar, so «до N человек», the
  counters, the participants and the spread in the graph follow the same number; whole hundreds keep the
  grammar of "N people" the same in every language. Shares stay $1 and $5.
- **Phone scrolling.** On touch screens the page follows the finger and the momentum is ours: a swipe in the
  story moves exactly one beat, a fling stops at the next rest point ahead (the top of a section, the last
  screen of a tall one), so nothing is skipped. Inside a section taller than the screen nothing pulls, for
  touch and wheel alike, so it reads like a normal page. CSS scroll snapping was rejected: Safari breaks
  free scrolling inside snap areas taller than the screen.
- **App.** «Возможно, вы знакомы» on the Add screen starts folded to three people with an "N more" button.

### 20. A turn before the app, fewer stops (2026-11-19)

The user: «На лендинге надо крутить несколько раз вокруг свое оси граф при прокруте между You и In The App.
Подумать над сокращением количества ступеней прокрутки (обьединение некоторых?) Немного долго листать.»

- **The turn.** From «Вы» to «В приложении» the graph turns twice round the vertical axis through you,
  following the scroll and easing out about two seconds after the page stops; Oleg's and Maria's labels wait
  until it stops.
- **Fewer stops.** Measured before: 20 stops to the bottom on a 390×844 phone, 16 at 1440×900. Proposed: join
  «Скворцы» and «Люди», fit "next" and the app into one phone screen each, and possibly join «Каждый решает
  сам» with «Понемногу от многих»; the user approved the first two («давай делай»). Now the starling and the
  people are one beat: its words are the starling's line, then «Люди связаны так же.» and the 4,57 figure;
  the scene keeps its nine phases and runs through both by the beat's middle, with the wide shot brought
  closer (44 → 32) because a glide passes the close-up of one bird. On phones the "next" network fills what
  the words leave of the screen and the app section is tighter. After: 17 stops on the phone (Russian,
  English, German, Ukrainian, Arabic), 15 on desktop; a 375×667 phone still gets two stops for the taller
  sections.

## Related
- [The core message](../core/core-message.md) — source: every line on the page.
- [The Need protocol](../mechanics/need-protocol.md) — evidence: up to N people, nearest first, from $1, reversible, the chat.
- [Claims](../principles/claims.md), [vocabulary](../principles/vocabulary.md) — constrain: the copy and the frost model's wording.
- [Latent connectedness](../theory/latent-connectedness.md), [the conditional law](../theory/autocatalytic-law.md) — source: the two metaphors.
- [Landing concept "lights"](landing-concept-lights.md), [landing concepts](landing-concepts.md) — earlier, rejected directions.
- [Packaging plan](packaging-plan.md) — parent: stage 3.
