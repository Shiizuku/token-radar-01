# LaunchRadar — the pre-token board

[![make.fun bounty](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Shiizuku/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Shiizuku/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

An entry for the make.fun bounty **Build the best token launch radar**
(token-radar-01), submitted by @qyxra.

LaunchRadar reads the sealed DefiLlama snapshot (758 protocols) and ranks
every protocol that records no token yet — 233 rows, the full 40-protocol
watchlist included — by the value a launch could plausibly carry if the
protocol's record stayed as it is. Protocols that already trade are never
ranked; they are listed apart with the market's own figures. Exchange
reserve listings, bridges, and wrapped/staked products of assets that
already trade are set aside unranked, for the same reason the snapshot's
watchlist leaves them out.

## The model

Implied value = TVL × category rate × momentum × maturity × breadth,
computed only from the snapshot's own figures:

- **category rate** — derived, never stated by hand: the median
  market-cap/TVL of the category's already-trading protocols in the
  same snapshot, after every peer ratio is winsorised at the peer
  set's 90th percentile (one protocol trading at hundreds of times
  its TVL cannot set a category's rate), and shrunk toward the global
  median (weight 4) when a category has few traded peers — the global
  median itself when it has none;
- **momentum** — from the seven-day TVL change, clamped −50%…+100%,
  weight 0.6; unreported change is neutral;
- **maturity** — grows with the years a protocol has run with no token
  (listed_at against the snapshot's as_of date);
- **breadth** — +3% per additional chain, capped at +15%.

Every implied value is shown with its peer range — the same
calculation at the shrunk 25th and 75th percentiles of the category's
peer spread — because a point estimate would claim a precision the
peer set does not support. Each row's detail view shows its four
factors, the peer basis behind its rate (how many traded peers, at
what median), and factual caution flags read from its own figures
(sharply falling TVL, single chain, short track record, thin peer
set).

No protocol is scored by name: one function prices every row. Every
row carries a five-to-six-step farm plan written from its category,
home chain and TVL tier, with position sizes, gas budgets and week
counts.

## The dashboard

`dashboard/` is a static page (no framework, no network): a sortable,
filterable board (search, category, chain, watchlist-only), a detail
view per protocol with its factor breakdown and farm plan, and a
separate already-trading list. It reads `data.js`, which the program
writes beside it.

## Run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Node 22, standard library only. The program writes `board.json`,
`data.js`, `dashboard/`, `screenshots/` and `dossier.json` to the output
directory, deterministically — two runs produce the same bytes.

---
Submitted to [make.fun](https://make.fun/bounty/token-radar-01) · referral: [make.fun/?ref=qyxra](https://make.fun/?ref=qyxra)
