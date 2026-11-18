---
id: 20261118-vocabulary
title: Vocabulary — words to use and words to avoid (EN/RU)
tags: [vocabulary, principles]
created: 2026-11-18
updated: 2026-11-18
related: [20261118-principles, 20261118-claims, 20261118-need-protocol, 20261118-invitational-coordination]
summary: Canonical English and Russian terms for SO (Need, Participation, intention, risk sharing, handshake, participants' chat, activity…), the words that are forbidden in public, and the style rules for SO texts.
---

# Vocabulary — words to use and words to avoid (EN/RU)

> Summary: Canonical English and Russian terms for SO (Need, Participation, intention, risk sharing, handshake, participants' chat, activity…), the words that are forbidden in public, and the style rules for SO texts.

## Context

The interface in 28 languages, the assistant, the bot, push texts, the landing and the legal texts
share one dictionary (decided 2026-11-10/12, see `docs/release/launch-readiness.md`). Marketing,
video and pitch texts use the same words, so that what people hear matches what they see in the app.

## Details

### Use

| EN | RU | Note |
|---|---|---|
| Need | Потребность | A participant's signal of what they need. Capitalised in EN UI. |
| Report a Need | Сообщить о потребности | Not "open a collection". |
| Participation | Участие | Another participant's signal about their own voluntary participation. |
| Report Participation | Сообщить об участии | |
| Withdraw Participation | Отозвать участие | Possible while the Need is open. |
| My intention | Моё намерение | The default amount a person is ready to name. In the brief: "intention". |
| Declared participation of the network | Заявленное участие сети | The sum of intentions in rings 1–3, on the home screen. |
| X of Y reported / Needed | Заявлено X из Y / Нужно | Not "collected". |
| Amount needed is reported | Нужная сумма заявлена | Not "goal reached". |
| Participants' chat | Чат участников | Any messenger. |
| Mark as received | Отметить полученное | A private note of the Need's author. |
| Activity | Активность | The history of a person's Needs and Participation. Not "reputation score". |
| Network of people you know | Сеть людей, которых вы знаете | Public word for the graph. |
| Handshake (1st, 2nd, 3rd) | Рукопожатие (1-е, 2-е, 3-е) | Depth of acquaintance. |
| Circle | Круг | The home screen and your 1st handshake. |
| Risk sharing | Распределение рисков | The purpose of the network. |
| Emergency / Regular | Экстренная / Регулярная | Need types. |

**Internal only** (strategy, partners, theory): "referential graph" / «референтный граф»,
"peer-to-peer mutual risk pooling", "dynamic crowdfunding of intentions", "autocatalytic growth".

**Theory register** (Lubalin's report; for builders, researchers, donors): subject; coercive vs
**invitational** interaction; idea → consensus → assistance; **social utility**; informational
messages; significant relations; formalising relations; **referential inheritance**; bounded
local field; latent global connectedness; critical mass N*; reproduction number m(N).

**Crowdfunding of intentions** (decided by the user, 2026-11-18): one mechanism with both uses.
Today it is Participation in a Need: people declare intentions, and the intentions add up to the
amount. Later it is initiatives: people declare intentions to back a common project. Internal term;
in public say "amounts add up, as in crowdfunding".
In public say "network of people you know", "risk sharing", "amounts add up, as in crowdfunding".

### Avoid in public

| Avoid | Why | Say instead |
|---|---|---|
| pool, fund, pot / пул, фонд, касса | Insurance terms; China's platforms were shut as unlicensed insurers | risk sharing / распределение рисков |
| insurance, coverage guarantee / страховка | Nobody pays in advance or promises payouts | "Is this insurance? No." |
| donation, contribution, collection / пожертвование, взнос, сбор | One-way giving to strangers; money handled by the service | Participation, Need |
| commitment, obligation (public) / обязательство | Participation is voluntary and reversible | Participation, intention |
| help guaranteed / помощь гарантирована | False | may, can, decide |
| rating, trust score, reputation score / рейтинг | SO does not rate people | activity, facts |
| "the app protects you", "the app helps you" | The app does not act instead of people | "people you know can share the load" |
| reputation history (in UI and video) | Sounds like a score | activity history / история активности |
| hui table (as the model) | Irrelevant example (inspirer, 2026-11-11) | Chinese online mutual aid platforms as the comparison |

### Style rules

- A person acts: active voice, the subject is a person.
- Plain words, short sentences, no long dashes in user-facing copy.
- Amounts in US dollars; "$1" in examples.
- Messenger-neutral: "in your chat", not "in Telegram".
- Run the `stop-slop` skill on any long text.

## Related
- [Principles](principles.md) — supports: why these words.
- [Claims](claims.md) — supports: what we may promise.
- [The Need protocol](../mechanics/need-protocol.md) — evidence: the strings the UI uses today.
- [Invitational coordination](../theory/invitational-coordination.md) — source: the theory register.
