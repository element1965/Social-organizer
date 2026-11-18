---
id: 20261118-trust-conditions-in-so
title: The three conditions of trust in Social Organizer
tags: [trust, mechanics, principles]
created: 2026-11-18
updated: 2026-11-18
related: [20261118-evolution-of-trust, 20261118-trust-archetypes, 20261118-need-protocol, 20261118-principles, 20261118-causal-chain, 20261118-invitational-coordination]
summary: How each SO mechanic supports (or would break) the three conditions under which trust evolves — repeat interactions, win-wins, low miscommunication — and why SO changes the game instead of policing players.
---

# The three conditions of trust in Social Organizer

> Summary: How each SO mechanic supports (or would break) the three conditions under which trust evolves — repeat interactions, win-wins, low miscommunication — and why SO changes the game instead of policing players.

## Context

Case's last lesson is SO's design thesis: **what the game is defines what the players do.**
Social Organizer does not try to make people better, check them or punish them. It changes the
game around them, so that trusting people you know (and the people they know) becomes the
rational move. This note is the working map from the research to the product. Every mechanic
named here is described, with code references, in [the Need protocol](../mechanics/need-protocol.md).

## Details

### Condition 1 — Repeat interactions with specific people

Trust evolves only when people expect to meet *the same specific people* again (the trenches,
not "the generic enemy").

| SO mechanic | Why it supports the condition |
|---|---|
| The network is made of confirmed acquaintances; each connection is confirmed by both | The players are specific people with names, not an audience. |
| Every Need arrives with its handshake chain ("you see Maria's Need because Oleg knows her") | Even a stranger at the 3rd handshake is inside a repeated game: Oleg will meet both of you again. |
| Activity history stays (Needs reported, Participation reported, marked as received) | Reputation turns a one-time meeting into part of a repeated game ("indirect reciprocity": I take part for you, someone takes part for me). |
| You join *before* you need anything, and stay for years | Many rounds ahead: this is exactly the "knowledge of possible future interactions". |
| Regular support renews in 28-day cycles | Literally repeated rounds with the same people. |

**What would break it:** anonymous participants, Needs from people with no path to you, deleting
or hiding history, one-off public campaigns to strangers, broadcast-style messaging
(Case: mass media does not count, interaction must be two-way between individuals).

### Condition 2 — A possible win-win (non-zero-sum game)

Lower the reward for mutual cooperation and cheaters take over, even when cooperating still pays
more than mutual cheating.

| SO mechanic | Why it supports the condition |
|---|---|
| Risk sharing: a Need of $N reaches N people, nearest first, and each may take a small part | The coin machine: $1 costs each person little, while $300 at the right moment is worth far more to the one who needs it. Everyone sits on both sides of that machine over the years. |
| Minimum Participation is $1, and Participation is optional | The cost of cooperating stays low, so the ratio of benefit to cost stays high. |
| No fee, no pot, no operator | Nobody in the middle profits from the flow, so the game does not turn zero-sum ("my loss is their gain"). |
| Protection is mutual, not charity | The participant gains predictability for their own life, not only a good feeling. |
| Later: direct cooperation at friendly prices, without intermediaries ([direct cooperation](../future/direct-cooperation.md)) | More win-wins grow out of the same network. |

**What would break it:** large minimum asks, social pressure, fees or a common pot, framing SO as
donations to strangers (one-way giving is not a win-win), promises of payouts (makes it an
insurer and a zero-sum bet).

### Condition 3 — Low miscommunication (and forgiveness for small mistakes)

With 1–9% mistakes the forgiving Copykitten wins; above 10% distrust wins.

| SO mechanic | Why it supports the condition |
|---|---|
| A participants' chat link is mandatory for every Need, in any messenger | People talk in channels they already use and clear up the circumstances themselves. |
| The handshake chain lets you ask someone you know ("Oleg, what happened to Maria?") | You check through a person you trust, not through a platform's verdict. |
| Participation can be changed or withdrawn while the Need is open | Mistakes are cheap and reversible: forgiveness is built into the protocol. |
| One notification per Need, no reminder spam | Less noise, more attention per signal. |
| Facts shown side by side, with no score or label; "marked as received" is a private note of the Need's author | No machine verdict that can misread a situation and punish someone forever. |

**What would break it:** automatic ratings or penalties (they act like Grudger: one misunderstanding,
punishment forever), public accusation features, Needs without a chat, frequent notifications,
algorithmic "trust scores", AI-written judgements of people.

### The big lesson — change the game, not the players

| Changing the game (SO does this) | Controlling the players (SO avoids this) |
|---|---|
| Who can reach whom (handshake chains) | A moderator who decides who is right |
| How costly cooperation is ($1, reversible) | Ratings, scores, badges of honesty |
| What everyone can see (activity history, chain) | Automatic sanctions and bans by the crowd |
| Where people talk (their own chat) | A central fund that pays out |

Andrei Lubalin's formulation (2026-11-17) is the same lesson applied to fraud: SO does not try to
prevent every dishonest act by administrative control. It creates an environment where the
*material* consequences of a loss can be spread across many voluntary participants and the
*social* consequences become visible. Case: "we are each other's environment": each person who
joins and takes part changes the game for the people around them.

### The same lesson in the project's own theory

Lubalin's report reaches Case's conclusion from sociology: a coordination mechanism sets the
conditions of interaction, the conditions make some strategies rational, and recurring strategies
become the social environment. SO implements the invitational mechanism (idea → consensus →
assistance), where refusal carries no imposed consequence. Read the two together: Case shows *which*
conditions let trust grow; Lubalin shows *which kind of mechanism* produces an environment with those
conditions. See [invitational coordination](../theory/invitational-coordination.md).

### Precision rules

- Game theory *suggests*; it does not prove that SO will work. Say "the conditions under which
  trust tends to grow", not "trust is guaranteed".
- Visibility makes deception costly, not impossible. A loss can be shared, not guaranteed to be
  covered.
- Case's model leaves out reputation, shared values and contracts. SO adds one of them
  (activity history). Say so when you use the model.

## Related
- [The Evolution of Trust](evolution-of-trust.md) — source: the model and its numbers.
- [Characters as participant archetypes](trust-archetypes.md) — next: the characters applied to SO participants and abuse cases.
- [The Need protocol](../mechanics/need-protocol.md) — evidence: verified mechanics behind each row.
- [Principles](../principles/principles.md) — supports: no arbiter, no rating, people decide.
- [The causal chain](../core/causal-chain.md) — extends: from risk sharing to direct cooperation.
- [Invitational coordination](../theory/invitational-coordination.md) — converges: the project's own theory of the same lesson.
