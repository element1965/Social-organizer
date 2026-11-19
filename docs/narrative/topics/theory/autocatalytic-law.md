---
id: 20261118-autocatalytic-law
title: The Law of Autocatalytic Inevitability — thresholds, measurement, limits
tags: [theory, principles, funding]
created: 2026-11-18
updated: 2026-11-19
related: [20261118-latent-connectedness, 20261118-invitational-coordination, 20261118-claims, 20261118-causal-chain, 20261118-audiences]
summary: Lubalin's formal law of self-sustaining activation (k, q(N), p(N), m(N) > 1, critical mass N*), why "inevitability" is conditional, the parameters a deployment must measure, the conditions that would disconfirm it, and what the MVP did and did not test.
---

# The Law of Autocatalytic Inevitability — thresholds, measurement, limits

> Summary: Lubalin's formal law of self-sustaining activation (k, q(N), p(N), m(N) > 1, critical mass N*), why "inevitability" is conditional, the parameters a deployment must measure, the conditions that would disconfirm it, and what the MVP did and did not test.

## Context

Sections 6 and 8 of Lubalin's report (2026); the law was first published in 2025 (Lubalin,
*Discovery of the Law of Autocatalytic Inevitability*, Zenodo, doi 10.5281/zenodo.15778286). This
note settles how to state the law in public: the author's own text makes it **conditional and
testable**, which fits our [claims](../principles/claims.md) rules.

## Details

### The formal model

| Symbol | Meaning |
|---|---|
| `N` | current number of participants |
| `k` | average number of significant relations a participant formalises |
| `q(N)` | share of those relations that reach people not yet active, after overlap, clustering, reciprocal links and saturation |
| `k_eff(N) = k·q(N)` | newly exposed people per participant |
| `p(N)` | share of newly exposed people who join |
| `m(N) = k·q(N)·p(N)` | effective reproduction number |
| `N*` | critical mass: the smallest graph at which joining is rationally justified for a newcomer by the potential coverage the graph offers |

- `m(N) > 1` is the classical supercriticality condition of a branching process: each activation
  produces on average more than one further activation. The threshold itself is standard math; the
  original claim is that a social process exists to which it applies.
- `N ≥ N*` and `m(N) > 1` answer different questions: the first makes entry rational, the second
  makes expansion self-reproducing.
- `N_max(l) = k^l` is only potential reach in an ideal non-overlapping tree (the glossary's formula);
  real graphs overlap, which `q(N)` captures.

### The law, as the author states it

If people can get a calculable benefit from spreading the potential loss of one among many,
formalise their existing significant relations through an invitational mechanism, keep referential
inheritance and act through bounded local fields, then once **N ≥ N\*** and **m(N) > 1**, their
self-organisation becomes self-sustaining and manifests the latent global connectedness as a
functioning P2P environment of mutual assistance.

**"Inevitability" is conditional.** It does not mean that every invited person joins, that every
Need is satisfied, or that growth is uniform. It means that under the stated conditions the process
reproduces both the motive to join and more than one further activation per activation, so it no
longer depends on a growing centre.

### What a deployment must measure

`N(t)`; `k`; `q(N)`; `p(N)`; `m(N)`; retention; the distribution of referential distances; the net
individual benefit of participation compared with alternatives. `N*` is not assigned in advance; it
is estimated from observed data.

### What would count against it

- Comparable settings with different coordination mechanisms do not show different conditions,
  strategies and environments.
- Global reach requires `k` to grow with `N`, or requires proportional growth of a central capacity.
- Both thresholds hold over a sustained window but growth still needs a growing centre.
- The utility itself starts allocating action, moving or holding resources, imposing obligations or
  requiring a governing subject's approval (then it no longer instantiates the model).

### What the MVP showed

The network started from one participant and grew through existing relations to about 300
participants (report, July 2026; about 250 in the influencer chat; 287 people with connections on
2026-11-13). It handled real Needs, real Participation and real actions outside the app. It showed
that people can formalise relations into a working graph, that Need and Participation messages are
enough to start real coordination, and that the process can self-regulate. **It was not designed to
test the law or to find `N*`.** The cold-start hypothesis of 10–15 thousand participants is a
working estimate, not a measured threshold.

### How to say it in public

- Builders, researchers, donors: state the law with its conditions and its disconfirmation tests;
  "deployment will measure whether `m(N) > 1` holds".
- Participants: do not mention the law; talk about the network and the Need.
- Never: "mathematically proven that it will spread worldwide".

## Related
- [Latent connectedness](latent-connectedness.md) — prerequisite: the conditions the law assumes.
- [Invitational coordination](invitational-coordination.md) — prerequisite: the mechanism type.
- [Claims](../principles/claims.md) — applies: the public wording rule.
- [The causal chain](../core/causal-chain.md) — applies: link 5 (the self-reproducing dynamic).
- [Audiences](../audiences/audiences.md) — applies: for donors, measurement is what research funding buys.
