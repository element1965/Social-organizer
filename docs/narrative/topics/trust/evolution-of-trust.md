---
id: 20261118-evolution-of-trust
title: The Evolution of Trust (Nicky Case) — what it shows
tags: [trust, sources]
created: 2026-11-18
updated: 2026-11-18
related: [20261118-trust-conditions-in-so, 20261118-trust-archetypes, 20261118-sources]
summary: Faithful chapter-by-chapter summary of Nicky Case's interactive game on the game theory of trust, with its numbers, characters and conclusions.
---

# The Evolution of Trust (Nicky Case) — what it shows

> Summary: Faithful chapter-by-chapter summary of Nicky Case's interactive game on the game theory of trust, with its numbers, characters and conclusions.

## Context

*The Evolution of Trust* (https://ncase.me/trust/, July 2017, about 30 minutes to play) is an
interactive guide to why and how people trust each other. It is based on Robert Axelrod's book
*The Evolution of Cooperation* (1984). The author dedicated the game to the public domain
(README of github.com/ncase/trust), so we may quote and adapt it; we credit it anyway.

The text below comes from the game's own text file (`words.html` in that repository), read on
2026-11-18. The page itself loads its text by script, so a plain web fetch shows nothing.

## Details

### 0. The puzzle

Christmas 1914 on the Western Front: against orders, British and German soldiers left the
trenches, buried their dead, exchanged gifts and played games. In peacetime, by contrast, surveys
show trust falling for decades. The puzzle: *why, even in peacetime, do friends become enemies,
and why, even in wartime, do enemies become friends?*

### 1. One game: the trust machine

You put a coin into a machine and the other player gets **three** coins, and vice versa. Each side
chooses to COOPERATE (put a coin in) or CHEAT (don't).

| | They cooperate | They cheat |
|---|---|---|
| **You cooperate** | +2 / +2 | −1 / +3 |
| **You cheat** | +3 / −1 | 0 / 0 |

In a single game cheating is always the "rational" move. That is the dilemma: trust is nice but
lets others take advantage of you. Sometimes distrust is rational.

### 2. Repeated game: meet the characters

You play 5 opponents, 3–7 rounds each, without knowing which round is the last.

| Character | Strategy |
|---|---|
| **Copycat** | Starts with Cooperate, then copies your last move (tit for tat). |
| **Always Cheat** | "The strong shall eat the weak." |
| **Always Cooperate** | "Let's be best friends!" |
| **Grudger** | Cooperates until you cheat once, then cheats forever. |
| **Detective** | Opens Cooperate, Cheat, Cooperate, Cooperate. If you ever cheat back, plays Copycat; if you never do, plays Always Cheat to exploit you. |

### 3. One tournament

Every character plays every other, 10 rounds per match. **Copycat wins.** The Christmas truce was
not a fluke: many front lines independently built a "live and let live" system, because in the
trenches you face *the same specific soldiers every day*. It is a repeated game, and that makes
all the difference. Copycat's other names: the Golden Rule, reciprocal altruism, tit for tat.

### 4. Repeated tournaments: evolution

A three-step dance: play a tournament, eliminate the 5 worst, clone the 5 best, repeat. Culture
evolves this way too: unsuccessful behaviours go away, successful ones get imitated.

Start: 15 Always Cooperate, 5 Always Cheat, 5 Copycat. Always Cheat first eats the naive
cooperators and grows. Once they are gone, it faces Copycats, "who are nice, but not naive":
Copycats cooperate with each other while cheaters cheat each other. **Copycat inherits the
earth.** "We are punished by our sins, not for them." (Elbert Hubbard)

### 5. The evolution of distrust: change the game, not the players

- **Too few rounds.** Below about 6 rounds per match (5 or fewer in the simulation), Always Cheat
  dominates. The fewer repeat interactions, the more distrust spreads. Mass media doesn't count:
  it must be two-way interaction between specific individuals.
- **Too small a win-win.** Lower the "both cooperate" reward from +2 to +1 (still more than 0
  for mutual cheating) and Always Cheat takes over. Without a non-zero-sum game, trust cannot
  evolve.

The game also cites the 1985 vs 2004 surveys ("three" close friends vs "zero" as the most common
answer). That finding is disputed by later research (it may partly be a data artefact); do not
use it as a headline fact.

### 6. Mistakes

Real life has accidents and misreadings. Two Copycats who make one mistake fall into an endless
cycle of revenge. New characters:

| Character | Strategy |
|---|---|
| **Copykitten** | Like Copycat, but cheats back only after being cheated **twice in a row**: "the first one could be a mistake". |
| **Simpleton** | Starts Cooperate; if you cooperated, repeats its last move; if you cheated, switches its last move (even after its own mistake). |
| **Random** | Cheats or cooperates 50/50. |

Results with mistakes:
- With 5% mistakes and many Always Cooperate, **Simpleton** wins (it exploits non-retaliators
  after its own accidental cheat).
- With 5% mistakes and many Always Cheat, **Copykitten** wins: a hostile world plus a little
  noise rewards forgiveness.
- By mistake rate: **0% → Copycat; 1–9% → Copykitten; 10–49% → Always Cheat; 50% → nobody.**
  A little miscommunication leads to forgiveness; too much leads to widespread distrust. Case
  suspects modern media increased miscommunication more than communication.

### 7. Sandbox

Every knob is open: population, payoffs, rounds per match, how many are eliminated per
generation, mistake rate. Optional, for those who want to play.

### 8. Conclusion

Three things trust needs to evolve:
1. **Repeat interactions.** You need the knowledge of possible future interactions with the same
   people before trust can evolve.
2. **Possible win-wins.** A non-zero-sum game, where both sides can be better off.
3. **Low miscommunication.** Too much noise breaks trust; a little noise rewards forgiveness.

Case adds what the model leaves out: "reputation, shared values, contracts, cultural markers".

**The biggest lesson: "What the game is, defines what the players do."** Our problem is not only
that people lose trust; our environment acts against the evolution of trust. "We are each other's
environment. In the short run, the game defines the players. But in the long run, it's us players
who define the game." Closing advice: build relationships, find win-wins, communicate clearly.

### How the game teaches (method worth copying)

1. Opens with a true human story and a puzzle, not a definition.
2. One concrete rule at a time (a coin machine, not a payoff matrix).
3. You act first, then it explains (you play five strangers before you learn who they were).
4. "Place your bets": you predict before every reveal, so the result surprises or confirms you.
5. Strategies are characters with a voice and a hat.
6. Consequences are simulated over time (one match → tournament → evolution).
7. One knob at a time flips the world (rounds, payoff, mistake rate).
8. An optional sandbox for the curious.
9. A recap in three rules and one big lesson; an honest note about what the model leaves out.

## Related
- [Trust conditions in SO](trust-conditions-in-so.md) — applies: how each condition shows up in Social Organizer.
- [Characters as participant archetypes](trust-archetypes.md) — applies: the characters used to think about participants and abuse.
- [Sources](../meta/sources.md) — source log entry for this game.
