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

- **category rate** — value carried per $1 of TVL, per category (stated in
  `lib/model.ts` and on the dashboard);
- **momentum** — from the seven-day TVL change, clamped −50%…+100%,
  weight 0.6; unreported change is neutral;
- **maturity** — grows with the years a protocol has run with no token
  (listed_at against the snapshot's as_of date);
- **breadth** — +3% per additional chain, capped at +15%.

No protocol is scored by name: one function prices every row, and the
dashboard's detail view shows each protocol's four factors. Every row
carries a five-to-six-step farm plan written from its category, home
chain and TVL tier, with position sizes, gas budgets and week counts.

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
