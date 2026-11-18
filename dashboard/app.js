// LaunchRadar page logic: renders window.RADAR (written by main.ts as
// ../data.js) as a sortable, filterable board with a per-protocol detail
// view and a separate list of protocols that already trade. No network,
// no framework: the page is three files and the data beside it.

const R = window.RADAR;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const commas = (v) => Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const money = (v) => `$${commas(v)}`;
const compact = (v) => (v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : money(v));
const pct = (v) => (v === null ? '<span class="flat">—</span>' : `<span class="${v > 0 ? 'up' : v < 0 ? 'down' : 'flat'}">${v > 0 ? '+' : ''}${v.toFixed(1)}%</span>`);

const params = new URLSearchParams(location.search);
const state = {
  q: params.get('q') ?? '',
  cat: params.get('cat') ?? '',
  chain: params.get('chain') ?? '',
  watch: params.get('watch') === '1',
  view: params.get('view') === 'live' ? 'live' : 'board',
  sort: 'rank',
  dir: 1,
  detail: params.get('detail') ?? '',
};

// ---------- header: stats and the stated model ----------
$('stats').innerHTML = [
  [commas(R.scanned), 'protocols scanned'],
  [commas(R.pre_token), 'pre-token ranked'],
  [commas(R.watchlist_size), 'watchlist covered'],
  [commas(R.live_count), 'already trading'],
].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
$('asof').textContent = R.as_of;

const rates = Object.entries(R.model.category_rates).sort((a, b) => b[1] - a[1]);
$('model').innerHTML =
  `<b>The model.</b> Implied value = TVL × <code>category rate</code> × <code>momentum</code> × <code>maturity</code> × <code>breadth</code>. ` +
  `Category rates are derived from this snapshot, not assumed: each is the median market-cap/TVL of the category's already-trading protocols ` +
  `(${R.model.peers_total} peers in all; global median ${R.model.global_median.toFixed(2)}×, spread ${R.model.global_q1.toFixed(2)}×–${R.model.global_q3.toFixed(2)}×), ` +
  `shrunk toward the global median with weight ${R.model.shrink_k} when a category has few peers, and the global median itself when it has none. ` +
  `Peer ratios are winsorised at the peer set's 90th percentile (${R.model.winsor_cap.toFixed(2)}× here), so one protocol trading at hundreds of times its TVL cannot set a category's rate. ` +
  `Every implied value therefore carries a range: the same calculation at the peer spread's 25th and 75th percentiles. ` +
  `Momentum follows the seven-day TVL change (clamped ${R.model.momentum_floor}%…+${R.model.momentum_cap}%, weight ${R.model.momentum_weight}); ` +
  `maturity grows with the years a protocol has run with no token; breadth adds 3% per extra chain, capped at +15%. ` +
  `Nothing is scored by name: the same function prices every row, and each protocol's detail view shows its four factors, its peer basis and its range. ` +
  `Set aside unranked (${R.aside.cex + R.aside.bridge + R.aside.product}): centralised-exchange reserve listings (${R.aside.cex}), bridges and canonical bridges (${R.aside.bridge}), and wrapped, staked or exchange-issued products of assets that already trade (${R.aside.product}) — none of them is a protocol waiting on a first token.` +
  `<details><summary>Category rates as derived (value per $1 of TVL)</summary><table><tr><th>Category</th><th>Traded peers</th><th>Rate used</th></tr>` +
  rates.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${R.model.category_peers[k] ?? 0}</td><td>${v.toFixed(3)}</td></tr>`).join('') +
  `</table></details>`;

// ---------- insights: what the board says ----------
const I = R.insights;
$('insights').innerHTML =
  `<b>What the board says.</b> The ${R.rows.length} pre-token protocols carry ${compact(I.total_implied_usd)} of combined implied launch value; the median row sits at ${compact(I.median_implied_usd)}. ` +
  `${esc(I.top_category)} holds the largest share of that value (${compact(I.top_category_implied_usd)}). ` +
  (I.fastest_watchlist_name !== null
    ? `Fastest riser on the watchlist this week: ${esc(I.fastest_watchlist_name)} (${I.fastest_watchlist_change > 0 ? '+' : ''}${I.fastest_watchlist_change.toFixed(1)}% TVL in seven days).`
    : `No watchlist protocol reports a seven-day change in this snapshot.`);

// ---------- toolbar ----------
$('cat').innerHTML = `<option value="">All categories</option>` + R.categories.map((c) => `<option ${c === state.cat ? 'selected' : ''}>${esc(c)}</option>`).join('');
$('chain').innerHTML = `<option value="">All chains</option>` + R.chains.map((c) => `<option ${c === state.chain ? 'selected' : ''}>${esc(c)}</option>`).join('');
$('q').value = state.q;
$('watch').checked = state.watch;

function filtered() {
  const q = state.q.trim().toLowerCase();
  return R.rows.filter((r) =>
    (state.cat === '' || (r.category ?? 'Uncategorised') === state.cat) &&
    (state.chain === '' || r.chains.includes(state.chain)) &&
    (!state.watch || r.watchlist) &&
    (q === '' || r.name.toLowerCase().includes(q) || r.slug.includes(q)));
}

const SORTS = {
  rank: (r) => r.rank, name: (r) => r.name.toLowerCase(), category: (r) => (r.category ?? '').toLowerCase(),
  tvl: (r) => r.tvl_usd, change: (r) => (r.change_7d === null ? -Infinity : r.change_7d),
  implied: (r) => r.implied_value_usd, ratio: (r) => r.ratio,
};

function renderBoard() {
  const rows = filtered().slice().sort((a, b) => {
    const d = SORTS[state.sort](a) - SORTS[state.sort](b);
    return (Number.isNaN(d) ? String(SORTS[state.sort](a)).localeCompare(String(SORTS[state.sort](b))) : d) * state.dir;
  });
  $('count').textContent = `${rows.length} of ${R.rows.length} protocols`;
  $('rows').innerHTML = rows.map((r) => `
    <tr data-slug="${esc(r.slug)}">
      <td class="num rank">${r.rank}</td>
      <td><span class="name">${esc(r.name)}</span>${r.watchlist ? '<span class="badge">WATCHLIST</span>' : ''}<br><span class="slug">${esc(r.slug)}</span></td>
      <td class="cat">${esc(r.category ?? 'Uncategorised')}<br><span class="chains">${esc(r.chains.join(' · '))}</span></td>
      <td class="num">${money(r.tvl_usd)}</td>
      <td class="num">${pct(r.change_7d)}</td>
      <td class="num implied">${money(r.implied_value_usd)}<br><span class="range">${compact(r.implied_low_usd)} – ${compact(r.implied_high_usd)}</span><div class="bar2"><i style="width:${Math.max(4, Math.round((100 * Math.log(Math.max(2, r.implied_value_usd))) / Math.log(R.rows[0].implied_value_usd)))}%"></i></div></td>
      <td class="num">${r.ratio.toFixed(2)}×</td>
      <td class="plan">${r.farm_steps.length} steps →</td>
    </tr>`).join('');
  for (const tr of $('rows').querySelectorAll('tr')) {
    tr.addEventListener('click', () => openDetail(tr.dataset.slug));
  }
}

function factorBar(label, value, max, note) {
  const w = Math.max(3, Math.min(100, (value / max) * 100));
  return `<div class="factor"><div class="fname">${label}</div><div class="fval">${value.toFixed(2)}×</div><div class="bar"><i style="width:${w}%"></i></div><div class="chains">${note}</div></div>`;
}

function openDetail(slug) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) return;
  state.detail = slug;
  const f = r.factors;
  $('detail').hidden = false;
  $('detail').innerHTML = `
    <button class="close" type="button" id="close-detail">Close ✕</button>
    <h2>${esc(r.name)} ${r.watchlist ? '<span class="badge">WATCHLIST</span>' : ''}</h2>
    <p class="sub">Rank #${r.rank} of ${R.rows.length} pre-token protocols · ${esc(r.category ?? 'Uncategorised')} · records no token in the ${R.as_of} snapshot</p>
    ${r.flags.length ? `<p class="flags">${r.flags.map((x) => `<span class="flag">${esc(x)}</span>`).join('')}</p>` : ''}
    <div class="facts">
      <div class="fact"><b>${money(r.tvl_usd)}</b><span>TVL</span></div>
      <div class="fact"><b>${money(r.implied_value_usd)}</b><span>Implied value</span><div class="range">peer range ${compact(r.implied_low_usd)} – ${compact(r.implied_high_usd)}</div></div>
      <div class="fact"><b>${r.ratio.toFixed(2)}×</b><span>Value / TVL</span></div>
      <div class="fact"><b>${r.change_7d === null ? '—' : `${r.change_7d > 0 ? '+' : ''}${r.change_7d.toFixed(1)}%`}</b><span>TVL change, 7d</span></div>
      <div class="fact"><b>${esc(r.listed_at ?? 'unknown')}</b><span>Tracked since</span></div>
      <div class="fact"><b>${esc(r.chains.join(', ') || '—')}</b><span>Chains</span></div>
    </div>
    <div class="factors">
      ${factorBar('Category rate', f.category_rate, 1.2, r.peers.n > 0 ? `median of ${r.peers.n} traded peer${r.peers.n === 1 ? '' : 's'} in the category` : 'global median — no traded peers in the category')}
      ${factorBar('Momentum', f.momentum, 1.6, 'from the 7-day TVL change')}
      ${factorBar('Maturity', f.maturity, 1.0, 'years running with no token')}
      ${factorBar('Breadth', f.breadth, 1.15, `${r.chains.length} chain${r.chains.length === 1 ? '' : 's'}`)}
    </div>
    <h3>Farm plan — before any token exists</h3>
    <ol>${r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
  $('close-detail').addEventListener('click', () => { $('detail').hidden = true; state.detail = ''; });
  $('detail').scrollIntoView({ block: 'start' });
}

function renderLive() {
  $('liverows').innerHTML = R.live.map((p) => `
    <tr><td><span class="name">${esc(p.name)}</span><br><span class="slug">${esc(p.slug)}</span></td>
    <td class="cat">${esc(p.category ?? 'Uncategorised')}</td>
    <td class="num">${money(p.tvl_usd)}</td><td class="num">${money(p.mcap_usd)}</td>
    <td class="num">${(p.mcap_usd / Math.max(1, p.tvl_usd)).toFixed(2)}×</td></tr>`).join('');
}

function setView(v) {
  state.view = v;
  $('view-board').classList.toggle('active', v === 'board');
  $('view-live').classList.toggle('active', v === 'live');
  $('board').hidden = v !== 'board';
  $('live').hidden = v !== 'live';
  if (v === 'live') renderLive();
}

// ---------- events ----------
$('q').addEventListener('input', (e) => { state.q = e.target.value; renderBoard(); });
$('cat').addEventListener('change', (e) => { state.cat = e.target.value; renderBoard(); });
$('chain').addEventListener('change', (e) => { state.chain = e.target.value; renderBoard(); });
$('watch').addEventListener('change', (e) => { state.watch = e.target.checked; renderBoard(); });
$('view-board').addEventListener('click', () => setView('board'));
$('view-live').addEventListener('click', () => setView('live'));
for (const th of document.querySelectorAll('#board th[data-sort]')) {
  th.addEventListener('click', () => {
    const k = th.dataset.sort;
    if (state.sort === k) state.dir *= -1; else { state.sort = k; state.dir = k === 'name' || k === 'category' ? 1 : -1; if (k === 'rank') state.dir = 1; }
    renderBoard();
  });
}

setView(state.view);
renderBoard();
if (state.detail) openDetail(state.detail);
