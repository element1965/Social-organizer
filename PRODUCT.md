# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

One React SPA serves every surface: the website (www.orginizer.com), the iOS and Android apps (Capacitor wrappers that load the production URL) and the Telegram Mini App. The design language is our own on every surface, not native iOS or Material. The Mini App takes only the colour scheme from Telegram.

## Users

- **Primary: a person who got a link from someone they know.** They need nothing today and are deciding whether joining is worth it. They usually arrive from WhatsApp or Telegram on a phone, often an inexpensive Android, and decide within about a minute.
- **Community organiser.** Someone inside a group of 20–40 people that already meets and chips in when someone has trouble (harambee or chama in Kenya, for example). They bring the whole group in at one meeting where people confirm each other by QR code, and they need the invite path (link, understand, join, confirm) to work for everyone in the room.

## Product Purpose

People build a network of people they know in person, and each connection is confirmed by both sides. When one of them is in trouble, such as a job loss or urgent surgery, they report a Need with an amount in US dollars and a link to a participants' chat. The Need reaches as many people as it names dollars, nearest by handshakes first. Each person decides for themselves whether to report a small Participation, usually a dollar or a few, and the participants agree on the rest directly. Being part of such a network makes each person's own risks bearable before the bad day comes.

Success means real groups activate and keep going: people confirm their acquaintances, invite others, and Needs reach people who choose to take part.

## Positioning

This is risk sharing among people who know each other, carried by a confirmed graph of acquaintances. There is no treasurer, no common pot, no size limit and no centre that could be closed. China's online mutual aid platforms worked on a similar idea, but they were central services and were shut down as unlicensed insurers. In SO nobody pays in advance, no payout is promised, and the app does not accept, transfer or hold any money, takes no fee, and does not rate or judge anyone. A Need notifies a limited number of people, one per dollar it names, so a notification carries weight.

## Operating Context

- Entry comes through a real relation. An invite link or QR code names the inviter, and the path of entry stays visible.
- The home screen, Circle, is a 3D scene of the person's network by handshake distance (1st, 2nd and 3rd handshake). Active people have 100+ direct connections.
- Reporting a Need requires at least 5 first-degree connections and at least 10 reachable people. The first Need is capped at twice the network's declared participation, and every Need needs a goal of at least 10 $.
- The participants' chat can be in any messenger. Wording stays messenger-neutral.
- A public page for a Need (`/sos/:id`) shows totals to anyone. Joining from it creates a direct connection with the author.
- Signals come as push notifications and through the Telegram bot @socialorganizer_bot. The project sends nothing on a schedule that people did not ask for.
- The live mechanics, with code references, are in `docs/narrative/topics/mechanics/need-protocol.md`.

## Capabilities and Constraints

- Every operation is informational. It moves no money, creates no obligation and assigns nobody to act.
- Participation is voluntary, starts at 1 $ and can be changed or withdrawn while the Need is open.
- Who sees what on a Need: the author and active participants see names and amounts. Signed-in people who have not joined see names without amounts. The chat link goes only to the author and participants.
- There is one shared network. An instance run from the open code is a separate network.
- Free and open source under AGPL-3.0-or-later.
- The interface is in 28 languages, including right-to-left Arabic and Hebrew. Amounts are always in US dollars and written as "300 $" in every language. Example amounts follow the reader's price level (100–600 $).
- Theme: Auto, Light or Dark.
- Vocabulary is fixed in `docs/narrative/topics/principles/vocabulary.md`. Use Need, Participation, intention, risk sharing, handshake, participants' chat and activity. Never use pool, fund, insurance, donation, collection, obligation, rating or "help guaranteed".
- Rejected and not to be proposed again: a bot in group chats, a weekly network summary, a network picture for stories, and scheduled messages.

## Brand Commitments

- Name: Social Organizer (SO). It is the open-source utility of EXODUS 2.0, a digital societal innovation. The theory comes from Andrei Lubalin's report *From Human Behaviour to Social Coordination* (Zenodo).
- One brand mark: the white fish on a care-teal tile (`ui2/BrandMark.tsx`, `apps/web/public/logo.png`). Icons, splashes and the link preview image all come from `scripts/generate-site-icons.mjs`.
- The voice is set out in `docs/narrative/`: [What SO is](docs/narrative/topics/core/what-so-is.md), the core message and the claims. The story starts with building the network and never with money or "coordination". In every sentence a person acts, not the app. Possibility is never presented as a guarantee.
- The headline is "It's a smaller world than you think." / «Мир теснее, чем кажется.»
- The people behind the project are named only on `/press` (Andrei Lubalin, author; Sviatoslav Tvardovskyi and Nikita Solovey, contributors). No names or faces go on the main landing.
- The team has no ties to Russia. Russian is a working language only and never a market framing.

## Evidence on Hand

- A live production app with real users (about 300 people with connections in November 2026). Any number shown in public must come from production data with its date.
- App screenshots in `apps/web/public/landing/app/` and store assets in `play-store-assets/`.
- The published video "Direct Mutual Support Through Real Connections".
- Theory sources: Lubalin's report (Zenodo 21629935) and his preprint on the Law of Autocatalytic Inevitability (doi 10.5281/zenodo.15778286). The law is conditional and must be stated with its thresholds.
- **Absent, never to be invented:** testimonials, quotes from users, case studies, press coverage, a legal entity, a team e-mail or address, and any claim that growth is proven.

## Product Principles

1. **The network comes first.** Every surface and story starts with people you know, and signals travel only through confirmed acquaintances.
2. **People act; the app enables.** Every decision stays with a person, and nobody decides who deserves help.
3. **Voluntary, with no pressure.** Declining changes nothing. A Need reaches each person once, and nothing nags.
4. **Facts, not judgements.** Show who connects you and what happened. Never score, rate or verify people.
5. **Money and agreements stay outside.** The app carries two signals, a Need and a Participation. It never handles funds and never promises an outcome.

## Accessibility & Inclusion

- **Inexpensive Android phones and poor networks.** Many people in the communities SO starts with use low-end Android phones on slow, costly mobile data. Keep pages light and fast to first use, keep the 3D scene cheap, and make every task work when the connection is bad.
- **Full right-to-left support.** Arabic and Hebrew must work as native layouts, mirrored and checked, not as translated strings in a left-to-right layout.
- **Plain language.** Many people read the interface in their second language. Use short sentences and everyday words, with no jargon. Every step must make sense to someone who has never heard of the project.
