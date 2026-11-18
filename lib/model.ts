// LaunchRadar model: one sealed DefiLlama snapshot in, one ranked board out.
//
// The board ranks every protocol whose record shows no token yet (no market
// cap, no CoinGecko id, no symbol in the snapshot) by the value a launch
// could plausibly carry if the protocol's record stayed as it is. Protocols
// that already trade are never ranked: they are counted and listed apart in
// the dashboard data as the market's own reference points.
//
// The implied value is a product of four factors, every one of them read
// from the snapshot's own figures — no protocol name is ever special-cased:
//
//   implied = tvl x categoryRate x momentum x maturity x breadth
//
//   categoryRate  the share of TVL that comparable, already-tokenised
//                 protocols in the same category carry as value in this
//                 snapshot: the median market-cap/TVL of the category's
//                 traded protocols, shrunk toward the global median when
//                 the category has few traded peers (weight 4), after
//                 every peer ratio is winsorised at the peer set's 90th
//                 percentile so one extreme peer cannot set the rate.
//                 Implied values also carry the peer spread — the shrunk 25th
//                 to 75th percentile band — as a range. No rate is
//                 stated by hand: every one is derived from the
//                 snapshot's own traded rows and printed, with its peer
//                 count, on the dashboard.
//   momentum      1 + clamp(change_7d, -50, 100) / 100 x 0.6 — a protocol
//                 gaining TVL is launching into demand; a shrinking one
//                 is discounted. Unreported change counts as neutral.
//   maturity      0.55 + 0.45 x min(ageDays, 1460) / 1460 — age is the
//                 snapshot's listed_at against its as_of date: a record
//                 that has run for years with no token has had time to
//                 become infrastructure. Unknown age scores mid-scale.
//   breadth       1 + 0.03 x min(chains - 1, 5) — multi-chain protocols
//                 launch to a wider holder base, capped at +15%.
//
// Some records are set aside before scoring, for the same reason the
// snapshot's own watchlist rule leaves them out: they are not protocols
// waiting on a first token.
//   - centralised-exchange listings (category CEX) track exchange
//     reserves — customer funds an exchange holds;
//   - bridges (Bridge, Canonical Bridge) move other protocols' assets:
//     a canonical bridge's token story belongs to its chain, and a
//     wrapped-asset bridge is the asset itself in transit (WBTC is the
//     standing example, named as such in the competition's own rules);
//   - products of an exchange or of a staked asset: a name beginning
//     with an exchange's name (Binance, Coinbase, Bybit, Kraken, Bitget,
//     OKX, Bitfinex, Gemini), a name carrying the whole word wrapped,
//     staked or staking, and the Liquid Restaking / Restaked BTC
//     categories.
// They are counted and named in the dashboard data, never ranked.
//
// Farm steps are written per row from the protocol's category, home chain
// and TVL tier, with position sizes, gas budgets and week counts stated,
// so a reader can act on them without guessing.

/** One protocol exactly as the sealed snapshot carries it (ten fields). */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The snapshot document as fetched by the house. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** One ranked row of the board the gate reads. */
export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
}

/** The factor breakdown the dashboard shows for one protocol. */
export interface RowDetail {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  watchlist: boolean;
  rank: number;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  peers: { n: number; median: number };
  flags: string[];
  ratio: number;
  factors: { category_rate: number; momentum: number; maturity: number; breadth: number };
  farm_steps: string[];
}

/** A protocol that already trades, kept apart from the ranked board. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
}

/** Everything the dashboard page renders. */
export interface RadarData {
  as_of: string;
  floor_usd: number;
  scanned: number;
  pre_token: number;
  live_count: number;
  aside: { cex: number; bridge: number; product: number };
  watchlist_size: number;
  categories: string[];
  chains: string[];
  rows: RowDetail[];
  live: LiveRow[];
  model: {
    peers_total: number;
    winsor_cap: number;
    global_median: number;
    global_q1: number;
    global_q3: number;
    shrink_k: number;
    category_rates: Record<string, number>;
    category_peers: Record<string, number>;
    momentum_weight: number;
    momentum_floor: number;
    momentum_cap: number;
  };
}

export const MOMENTUM_WEIGHT = 0.6;
export const MOMENTUM_FLOOR = -50;
export const MOMENTUM_CAP = 100;
/** Peer-count weight of the global median when a category rate is shrunk toward it. */
export const SHRINK_K = 4;

function r4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

/** One quantile of an ascending-sorted set (linear interpolation, deterministic). */
export function quantileOf(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo]! : sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Peer ratios are winsorised at this quantile of the whole peer set before any rate is taken. */
export const WINSOR_Q = 0.9;

/** Median and quartiles of a set of ratios (linear interpolation, deterministic). */
export function peerStats(ratios: number[]): { n: number; median: number; q1: number; q3: number } {
  const s = ratios.slice().sort((a, b) => a - b);
  return { n: s.length, median: quantileOf(s, 0.5), q1: quantileOf(s, 0.25), q3: quantileOf(s, 0.75) };
}

/** The category rate in use, its peer-spread band, and the peer basis behind it. */
export interface RateInfo {
  rate: number;
  low: number;
  high: number;
  peers: number;
  median: number;
}

/** Shrink a category's peer stats toward the global ones; with no peers the global rate is the rate. */
export function rateFromPeers(
  cat: { n: number; median: number; q1: number; q3: number } | undefined,
  global: { n: number; median: number; q1: number; q3: number },
): RateInfo {
  if (cat === undefined || cat.n === 0) {
    return { rate: r4(global.median), low: r4(global.q1), high: r4(global.q3), peers: 0, median: global.median };
  }
  const mix = (v: number, g: number) => (cat.n * v + SHRINK_K * g) / (cat.n + SHRINK_K);
  return {
    rate: r4(mix(cat.median, global.median)),
    low: r4(mix(cat.q1, global.q1)),
    high: r4(mix(cat.q3, global.q3)),
    peers: cat.n,
    median: cat.median,
  };
}

/** Parse the snapshot text; throws on a shape this model cannot read. */
export function parseSnapshot(text: string): Snapshot {
  const doc = JSON.parse(text) as Snapshot;
  if (!Array.isArray(doc.protocols) || !Array.isArray(doc.watchlist)) {
    throw new Error('snapshot is missing its protocols or watchlist arrays');
  }
  return doc;
}

/** Whole days between two YYYY-MM-DD dates, or null when either is unusable. */
function daysBetween(from: string | null, to: string): number | null {
  if (from === null) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** The four model factors for one protocol, given its derived category rate. */
export function factorsOf(p: SnapshotProtocol, asOf: string, categoryRate: number): RowDetail['factors'] {
  const category_rate = categoryRate;
  const growth = p.change_7d === null ? 0 : clamp(p.change_7d, MOMENTUM_FLOOR, MOMENTUM_CAP);
  const momentum = 1 + (growth / 100) * MOMENTUM_WEIGHT;
  const age = daysBetween(p.listed_at, asOf);
  const maturity = age === null ? 0.775 : 0.55 + 0.45 * (Math.min(age, 1460) / 1460);
  const breadth = 1 + 0.03 * Math.min(Math.max(p.chains.length - 1, 0), 5);
  return { category_rate, momentum, maturity, breadth };
}

/** Factual cautions a row carries, read from its own figures only. */
export function flagsOf(p: SnapshotProtocol, asOf: string, ri: RateInfo): string[] {
  const flags: string[] = [];
  if (p.change_7d !== null && p.change_7d <= -20) flags.push('TVL down sharply over 7 days');
  if (p.change_7d === null) flags.push('No 7-day change reported');
  if (ri.peers === 0) flags.push('No traded peers in its category — global rate');
  else if (ri.peers < 3) flags.push(`Only ${ri.peers} traded peer${ri.peers === 1 ? '' : 's'} — rate shrunk toward the global median`);
  const age = daysBetween(p.listed_at, asOf);
  if (age !== null && age < 180) flags.push('Tracked for under 6 months');
  if (p.chains.length === 1) flags.push('Single chain');
  return flags.slice(0, 4);
}

/** Whole-dollar formatting the farm steps use, e.g. 2500 -> "$2,500". */
function usd(v: number): string {
  return `$${Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** Position-size and effort tiers by TVL: bigger records justify more capital at risk. */
function tierOf(tvl: number): { stake: string; weeks: string; cadence: string } {
  if (tvl >= 500_000_000) return { stake: '$2,000-$5,000', weeks: '12-16 weeks', cadence: 'twice a week' };
  if (tvl >= 50_000_000) return { stake: '$500-$2,000', weeks: '10-12 weeks', cadence: 'twice a week' };
  if (tvl >= 10_000_000) return { stake: '$150-$500', weeks: '8-10 weeks', cadence: 'once a week' };
  return { stake: '$40-$150', weeks: '6-8 weeks', cadence: 'once a week' };
}

/** Typical all-in gas for one round trip of transactions, by home chain. */
function gasOf(chain: string): string {
  if (chain === 'Ethereum') return '$8-$30 in gas across the plan';
  if (chain === 'Solana') return 'under $1 in fees across the plan';
  if (chain === 'Bitcoin') return '$2-$10 in fees across the plan';
  return '$0.20-$2 in gas across the plan';
}

/** Category-specific opening moves; the first farm step for a row. */
function openingMove(p: SnapshotProtocol, home: string): string {
  const n = p.name;
  switch (p.category) {
    case 'Dexs':
      return `Trade on ${n} on ${home} until your cumulative volume passes ${usd(Math.max(5000, p.tvl_usd / 2000))}: swap between liquid pairs in varied sizes ($50-$400 a trade) rather than one large swap, so the activity reads as real flow.`;
    case 'Lending':
      return `Supply a blue-chip asset (ETH or a major stablecoin) to ${n} on ${home} and keep it supplied: lenders who also borrow 30-50% against their supply and repay on schedule build the deepest usage record.`;
    case 'CDP':
      return `Open a small vault on ${n} on ${home}: deposit collateral worth 2-3x the stablecoin you mint, keep the collateral ratio above 200%, and hold the position open rather than churning it.`;
    case 'Derivatives':
      return `Trade perps or options on ${n} on ${home} with small size ($25-$100 margin a position): open and close 2-3 positions a week, varying pairs and direction, and keep total volume growing month over month.`;
    case 'Bridge':
    case 'Canonical Bridge':
    case 'Cross Chain':
      return `Bridge through ${n} in both directions at least twice a month ($100-$500 a crossing): protocols remember wallets that moved real value across their routes before any points program existed.`;
    case 'Liquid Staking':
    case 'Liquid Restaking':
    case 'Staking Pool':
      return `Stake through ${n} on ${home} and hold the liquid staking token in your wallet (do not sell it into a pool): a continuous staking balance across several months is the record that matters.`;
    case 'Yield':
    case 'Yield Aggregator':
    case 'Farm':
      return `Deposit into one of ${n}'s core vaults on ${home} and leave the position compounding: choose the vault holding the largest share of its TVL, since flagship vaults are what a launch rewards first.`;
    case 'RWA':
      return `Buy a small position in one of ${n}'s live real-world-asset offerings on ${home} and hold it to a full yield cycle: early holders who sit through distributions are the wallets these launches track.`;
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
      return `Allocate to one curated vault on ${n} on ${home} and stay allocated: curators can see exactly which wallets funded their strategies early and stayed through drawdowns.`;
    default:
      return `Become a genuine user of ${n} on ${home}: complete its core action (deposit, trade or stake, whichever the product is built around) with real funds and repeat it on a schedule, not in one burst.`;
  }
}

/** The farm plan for one row: 5 concrete steps, each with cost or time stated. */
export function farmSteps(p: SnapshotProtocol): string[] {
  const home = p.chains[0] ?? 'its main chain';
  const tier = tierOf(p.tvl_usd);
  const multi = p.chains.length > 1
    ? `Repeat the core action on a second chain ${n2(p)} within the first month: multi-chain users are consistently over-represented in launch allocations.`
    : `Stay on ${home} for the whole plan: depth on one chain beats a thin record spread across many.`;
  return [
    openingMove(p, home),
    `Size the position at ${tier.stake} in total across the plan, funded gradually over the first two weeks; budget ${gasOf(home)} on top, and never farm with funds you cannot leave in place for ${tier.weeks}.`,
    `Keep the routine running for ${tier.weeks}: interact ${tier.cadence} (vary amounts and times of day), and snapshot your own balances monthly so you can prove continuity if a claim ever asks.`,
    multi,
    `Join ${p.name}'s official community channels and governance: vote in every public proposal during the plan (votes are free on most chains) and complete any official quest or testnet the team runs.`,
    `Set a monthly launch watch: re-check ${p.name}'s record (TVL trend, new chains, docs mentioning a token or points). If a points program or token appears, shift from passive holding to the program's stated tasks within the first week.`,
  ];
}

function n2(p: SnapshotProtocol): string {
  return p.chains[1] ? `(${p.chains[1]})` : '';
}

/** Build the ranked board and the dashboard data from one snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const watch = new Set(snapshot.watchlist);
  const isPreToken = (p: SnapshotProtocol) => p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
  const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
  /** Why a pre-token record is set aside unranked, or null when it belongs on the board. */
  const asideReason = (p: SnapshotProtocol): 'cex' | 'bridge' | 'product' | null => {
    if (p.category === 'CEX') return 'cex';
    if (p.category === 'Bridge' || p.category === 'Canonical Bridge') return 'bridge';
    if (EXCHANGE_PREFIXES.some((x) => p.name === x || p.name.startsWith(`${x} `))) return 'product';
    if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return 'product';
    if (p.category === 'Liquid Restaking' || p.category === 'Restaked BTC') return 'product';
    return null;
  };
  const aside = { cex: 0, bridge: 0, product: 0 };
  const preToken = snapshot.protocols.filter((p) => {
    if (!isPreToken(p)) return false;
    const reason = asideReason(p);
    if (reason !== null) {
      aside[reason] += 1;
      return false;
    }
    return true;
  });
  const liveAll = snapshot.protocols.filter((p) => p.mcap_usd !== null);

  // Category rates are derived, not stated: the traded rows that are not
  // set aside form the peer set, grouped by category over the whole set.
  const peerRows = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.tvl_usd > 0 && asideReason(p) === null);
  // Winsorise the peer ratios at the peer set's 90th percentile: a single
  // protocol whose token trades at hundreds of times its recorded TVL
  // must not be allowed to set a whole category's rate.
  const rawRatios = peerRows.map((p) => (p.mcap_usd ?? 0) / p.tvl_usd);
  const winsorCap = quantileOf(rawRatios.slice().sort((a, b) => a - b), WINSOR_Q);
  const peerRatios = rawRatios.map((r) => Math.min(r, winsorCap));
  const globalStats = peerStats(peerRatios);
  const byCat = new Map<string, number[]>();
  peerRows.forEach((p, i) => {
    if (p.category === null) return;
    const arr = byCat.get(p.category) ?? [];
    arr.push(peerRatios[i]!);
    byCat.set(p.category, arr);
  });
  const catStats = new Map<string, ReturnType<typeof peerStats>>();
  for (const [c, arr] of byCat) catStats.set(c, peerStats(arr));
  const rateOf = (p: SnapshotProtocol): RateInfo =>
    rateFromPeers(p.category === null ? undefined : catStats.get(p.category), globalStats);

  const scored = preToken.map((p) => {
    const ri = rateOf(p);
    const f = factorsOf(p, snapshot.as_of, ri.rate);
    const rest = f.momentum * f.maturity * f.breadth;
    const implied = Math.max(1, Math.round(p.tvl_usd * ri.rate * rest));
    const implied_low = Math.max(1, Math.round(p.tvl_usd * ri.low * rest));
    const implied_high = Math.max(implied, Math.round(p.tvl_usd * ri.high * rest));
    return { p, f, ri, implied, implied_low, implied_high };
  });
  // Rank by implied value; ties fall to TVL, then slug, so two runs agree byte for byte.
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));

  const rows: RowDetail[] = scored.map((s, i) => ({
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    watchlist: watch.has(s.p.slug),
    rank: i + 1,
    implied_value_usd: s.implied,
    implied_low_usd: s.implied_low,
    implied_high_usd: s.implied_high,
    peers: { n: s.ri.peers, median: Math.round(s.ri.median * 1000) / 1000 },
    flags: flagsOf(s.p, snapshot.as_of, s.ri),
    ratio: Math.round((s.implied / Math.max(1, s.p.tvl_usd)) * 1000) / 1000,
    factors: s.f,
    farm_steps: farmSteps(s.p),
  }));

  const board: BoardRow[] = rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    rank: r.rank,
    implied_value_usd: r.implied_value_usd,
    farm_steps: r.farm_steps,
  }));

  const live: LiveRow[] = liveAll
    .slice()
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, 60)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd ?? 0 }));

  const categories = [...new Set(rows.map((r) => r.category ?? 'Uncategorised'))].sort();
  const chains = [...new Set(rows.flatMap((r) => r.chains))].sort();

  const radar: RadarData = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    scanned: snapshot.protocols.length,
    pre_token: rows.length,
    live_count: liveAll.length,
    aside,
    watchlist_size: snapshot.watchlist.length,
    categories,
    chains,
    rows,
    live,
    model: {
      peers_total: globalStats.n,
      winsor_cap: r4(winsorCap),
      global_median: r4(globalStats.median),
      global_q1: r4(globalStats.q1),
      global_q3: r4(globalStats.q3),
      shrink_k: SHRINK_K,
      category_rates: Object.fromEntries(categories.map((c) => [c, rateFromPeers(catStats.get(c), globalStats).rate])),
      category_peers: Object.fromEntries(categories.map((c) => [c, catStats.get(c)?.n ?? 0])),
      momentum_weight: MOMENTUM_WEIGHT,
      momentum_floor: MOMENTUM_FLOOR,
      momentum_cap: MOMENTUM_CAP,
    },
  };
  return { board, radar };
}

/** The dashboard data file: one assignment the page reads. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

/**
 * Self-check against the gate's shape; returns the first problem found,
 * or null when the board is fit to hand in.
 */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, outside 100-4000`;
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  let prev = Number.POSITIVE_INFINITY;
  let allSame = true;
  for (let i = 0; i < board.length; i++) {
    const r = board[i]!;
    if (!slugs.has(r.slug)) return `row ${i + 1}: slug ${r.slug} is not in the snapshot`;
    if (seen.has(r.slug)) return `slug ${r.slug} appears twice`;
    seen.add(r.slug);
    if (r.rank !== i + 1) return `row ${i + 1}: rank is ${r.rank}, expected ${i + 1}`;
    if (!(r.implied_value_usd >= 1) || r.implied_value_usd > 100_000_000_000_000) return `row ${i + 1}: implied value out of range`;
    if (r.implied_value_usd > prev) return `row ${i + 1}: implied value rises as rank ascends`;
    if (i > 0 && r.implied_value_usd !== board[0]!.implied_value_usd) allSame = false;
    prev = r.implied_value_usd;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `row ${i + 1}: ${r.farm_steps.length} farm steps, outside 3-12`;
    for (const s of r.farm_steps) {
      const t = s.trim().length;
      if (t < 20 || t > 600) return `row ${i + 1}: a farm step is ${t} characters, outside 20-600`;
    }
    if (r.name.trim().length === 0) return `row ${i + 1}: empty name`;
  }
  if (allSame && board.length > 1) return 'every implied value is the same: the board ranks nothing';
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  return null;
}
