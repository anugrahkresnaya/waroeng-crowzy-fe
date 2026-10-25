// Balance checks: play the same month with different strategies and compare how they do. The bot never rolls dice itself, so a run is
// decided by the seed and the strategy. Used by `npm run balance` and by a small sanity test.
import { freezerRoom, slotsPerPiece } from '../freezer';
import { Game } from '../game';
import { costPerPortion, quoteOrder } from '../market';
import { total } from '../money';
import { nextShelf } from '../shelf';
import type { Content } from '../schema';
import { titipanRoom, titipanUnlocked } from '../titipan';
import { bankTheBigNotes, manageChange, payUp, playDay, restock, sleepThrough, type BotOptions } from './bot';

export interface Strategy {
  name: string;
  /** What this strategy is testing, in a few words. */
  note: string;
  /** Once, before the first day. */
  setup?(game: Game): void;
  /** Each morning, before the day's own routine. */
  beforeDay?(game: Game): void;
  options?: Partial<BotOptions>;
  /** Top up the token and data and pay the rent (default). */
  upkeep?: boolean;
  /** Move every dish price with its ingredient cost, as a player does after a price spike (default). */
  followCosts?: boolean;
}

export interface RunResult {
  strategy: string;
  /** Customers served on each game day, to see the crowd follow the calendar. */
  servedByDay: number[];
  seed: number;
  /** Bank, drawer and what the shelves and pantry are worth at cost, minus what is owed. */
  netWorth: number;
  gain: number;
  reputation: number;
  served: number;
  walkaways: number;
  turnedAway: number;
  stockoutDeclines: number;
  waste: number;
  days: number;
  workDays: number;
  trail: number[];
}

/** Everything the player owns, valued at cost. Equipment bought (a freezer) counts as spent, not as an asset. */
export function netWorth(game: Game): number {
  const { state, content } = game;
  let value = state.bank + total(state.drawer);
  for (const lot of state.pantry) value += lot.qty * lot.unitCost;
  for (const [id, qty] of Object.entries(state.stock)) value += qty * (state.goodsCost[id] ?? 0);
  value -= state.titipan.owed;
  for (const bill of content.balance.bills) {
    // every period of rent that has fallen due and is unpaid is money the player has already lost
    const due = state.bills[bill.id].dueDay;
    if (state.day >= due) value -= bill.amount * (Math.floor((state.day - due) / bill.everyDays) + 1);
  }
  return Math.round(value);
}

/**
 * The same game started on another date, so a run meets the seasons: from Monday 25 January 2027, 45 days cover the weeks before Ramadan,
 * Ramadan itself (8 February) and Lebaran (10 March). It must be a Monday, because day 0 is always a Monday in the weekly plan.
 */
export function ramadanContent(content: Content): Content {
  return { ...content, market: { ...content.market, calendarStart: { year: 2027, month: 1, day: 25 } } };
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** Frozen goods: buy a freezer once there is money to spare, and keep a few of each frozen good on hand. */
function freezerPlan(game: Game): void {
  const { state, content } = game;
  if (!state.freezer && state.bank >= content.market.freezerPrice + 300000) game.dispatch({ type: 'buyFreezer' });
  if (!state.freezer || state.phase !== 'idle') return;
  const targets: Record<string, number> = { 'es-krim': 40, nugget: 10, sosis: 5, 'bakso-beku': 5, dimsum: 5 };
  const incoming: Record<string, number> = {};
  for (const o of state.orders) if (o.status === 'transit') for (const l of o.lines) incoming[l.key] = (incoming[l.key] ?? 0) + l.qty;
  let room = freezerRoom(state, content);
  const lines: Array<{ key: string; qty: number }> = [];
  for (const [id, target] of Object.entries(targets)) {
    const item = content.itemById[id];
    const have = (state.stock[id] ?? 0) + (incoming[`g-${id}`] ?? 0) * (item.pack ?? 1);
    let packs = Math.ceil((target - have) / (item.pack ?? 1));
    while (packs > 0 && packs * (item.pack ?? 1) * slotsPerPiece(item) > room) packs--;
    if (packs <= 0) continue;
    room -= packs * (item.pack ?? 1) * slotsPerPiece(item);
    lines.push({ key: `g-${id}`, qty: packs });
  }
  while (lines.length > 0) {
    const q = quoteOrder(state, content, 'pak-slamet', lines, false);
    if (state.bank >= q.total && q.subtotal >= content.supplierById['pak-slamet'].minOrder) {
      game.dispatch({ type: 'placeOrder', supplier: 'pak-slamet', lines, express: false });
      return;
    }
    lines.pop();
  }
}

/** Buys the bigger fridge once there is money to spare. */
function bigFridgePlan(game: Game): void {
  const { state, content } = game;
  if (!state.bigFridge && state.bank >= content.market.bigFridge.price + 300000) game.dispatch({ type: 'buyBigFridge' });
}

/** Buys the next shelf upgrade once there is money to spare. */
function shelfPlan(game: Game): void {
  const { state, content } = game;
  const next = nextShelf(state, content);
  if (next && state.bank >= next.price + 300000) game.dispatch({ type: 'buyShelf' });
}

/** Buys a generator once there is money to spare. */
function generatorPlan(game: Game): void {
  const { state, content } = game;
  if (!state.generator && state.phase === 'idle' && state.bank >= content.balance.outage.generator.price + 300000) game.dispatch({ type: 'buyGenerator' });
}

/** Takes the most the neighbour allows of every consigned item. */
function takeAllTitipan(game: Game): void {
  const { state, content } = game;
  if (state.phase !== 'idle' || !titipanUnlocked(state, content)) return;
  for (const item of content.items) {
    if (!item.consign) continue;
    const room = titipanRoom(state, content, item.id);
    if (room > 0) game.dispatch({ type: 'takeTitipan', item: item.id, qty: room });
  }
}

/**
 * Keeps the margin when ingredients get dearer or cheaper: each dish price moves by the change in its cost since the last time it moved.
 * Small moves are ignored, so the price is not nudged by the daily wobble.
 */
function followCosts(game: Game, memory: Record<string, number>): void {
  const { state, content } = game;
  if (state.phase !== 'idle') return;
  for (const item of content.items) {
    if (item.kind !== 'dish') continue;
    const cost = costPerPortion(state, content, item);
    const last = memory[item.id] ?? cost;
    memory[item.id] = last;
    if (Math.abs(cost / last - 1) < 0.04) continue;
    const price = state.menu[item.id]?.price ?? item.price;
    game.dispatch({ type: 'setDishPrice', item: item.id, price: Math.max(500, roundTo((price * cost) / last, 100)) });
    memory[item.id] = cost;
  }
}

const reprice = (game: Game, mul: number) => {
  for (const item of game.content.items) {
    if (item.kind !== 'dish') continue;
    game.dispatch({ type: 'setDishPrice', item: item.id, price: Math.max(500, roundTo(item.price * mul, 100)) });
  }
};

export const STRATEGIES: Strategy[] = [
  { name: 'baseline', note: 'cook ahead, prepare the shelves, restock, pay up' },
  { name: 'cook-to-order only', note: 'no batches before opening', options: { cookAhead: false } },
  { name: 'skip prep', note: 'do not prepare the shelves before opening', options: { prepared: false } },
  { name: 'prices +15%', note: 'every dish 15% dearer', setup: (g) => reprice(g, 1.15) },
  { name: 'prices -15%', note: 'every dish 15% cheaper', setup: (g) => reprice(g, 0.85) },
  {
    name: 'small portions',
    note: 'smaller portions of every dish',
    setup: (g) => {
      for (const i of g.content.items) if (i.kind === 'dish') g.dispatch({ type: 'setPortion', item: i.id, portion: 'small' });
    },
  },
  {
    name: 'large portions',
    note: 'larger portions of every dish',
    setup: (g) => {
      for (const i of g.content.items) if (i.kind === 'dish') g.dispatch({ type: 'setPortion', item: i.id, portion: 'large' });
    },
  },
  { name: 'titipan', note: 'take all the consigned goods allowed each morning', beforeDay: takeAllTitipan },
  { name: 'freezer', note: 'buy a freezer when affordable and sell frozen goods', beforeDay: freezerPlan },
  {
    name: 'everything',
    note: 'freezer, titipan and +10% prices',
    setup: (g) => reprice(g, 1.1),
    beforeDay: (g) => {
      freezerPlan(g);
      takeAllTitipan(g);
    },
  },
  { name: 'big fridge', note: 'buy the bigger fridge when affordable', beforeDay: bigFridgePlan },
  { name: 'bigger shelf', note: 'buy the shelf upgrades when affordable and carry more', beforeDay: shelfPlan },
  { name: 'generator', note: 'buy a generator when affordable', beforeDay: generatorPlan },
  { name: 'fixed prices', note: 'never move a price, even when ingredients get dearer', followCosts: false },
  { name: 'neglect upkeep', note: 'never top up the token or data, never pay the rent', upkeep: false },
];

/** Plays `days` calendar days with a strategy from a fresh game. */
export function runStrategy(content: Content, strategy: Strategy, seed: number, days: number): RunResult {
  const g = new Game(content, { seed });
  strategy.setup?.(g);
  const start = netWorth(g);
  // A competent baseline: cook as much as the pre-open time allows and keep a few days of stock.
  const opts: BotOptions = { actionsPerTick: 4, batches: 'fill', restockMul: 1, ...strategy.options };
  const sums = { served: 0, walkaways: 0, turnedAway: 0, stockoutDeclines: 0, waste: 0 };
  const costMemory: Record<string, number> = {};
  const trail: number[] = [];
  const servedByDay: number[] = [];
  let workDays = 0;
  for (let d = 0; d < days; d++) {
    if (g.state.phase === 'idle' && (strategy.followCosts ?? true)) followCosts(g, costMemory);
    if (g.state.phase === 'idle') strategy.beforeDay?.(g);
    bankTheBigNotes(g);
    restock(g, 'pak-slamet', opts.restockMul ?? 1);
    if (strategy.upkeep ?? true) payUp(g);
    manageChange(g);
    if (g.state.phase === 'dayoff') {
      while (g.state.phase === 'dayoff') g.dispatch({ type: 'runBlock' });
    } else {
      playDay(g, opts);
      workDays++;
    }
    const s = g.state.stats;
    sums.served += s.served;
    sums.walkaways += s.walkaways;
    sums.turnedAway += s.turnedAway;
    sums.stockoutDeclines += s.stockoutDeclines;
    sums.waste += s.waste;
    trail.push(netWorth(g));
    servedByDay.push(s.served);
    sleepThrough(g);
  }
  const end = netWorth(g);
  return { strategy: strategy.name, servedByDay, seed, netWorth: end, gain: end - start, reputation: g.state.reputation, ...sums, days, workDays, trail };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Plays every strategy on every seed, and works out whether one strategy beats all the others everywhere. */
export function compareStrategies(content: Content, seeds: number[], days: number, strategies: Strategy[] = STRATEGIES) {
  const runs = strategies.map((s) => seeds.map((seed) => runStrategy(content, s, seed, days)));
  const rows = strategies.map((s, i) => {
    const r = runs[i];
    const n = r.length;
    return {
      name: s.name,
      note: s.note,
      median: median(r.map((x) => x.gain)),
      min: Math.min(...r.map((x) => x.gain)),
      max: Math.max(...r.map((x) => x.gain)),
      reputation: r.reduce((a, x) => a + x.reputation, 0) / n,
      served: r.reduce((a, x) => a + x.served, 0) / n / days,
      walkaways: r.reduce((a, x) => a + x.walkaways + x.turnedAway, 0) / n / days,
      declines: r.reduce((a, x) => a + x.stockoutDeclines, 0) / n / days,
      waste: r.reduce((a, x) => a + x.waste, 0) / n / days,
    };
  });
  // A strategy "wins outright" when it beats every other one on every seed.
  const winners = strategies
    .map((s, i) => ({ s, i }))
    .filter(({ i }) => strategies.every((_, j) => j === i || runs[i].every((run, k) => run.gain > runs[j][k].gain)))
    .map(({ s }) => s.name);
  const wins = strategies.map((s, i) => ({ name: s.name, seedsWon: seeds.filter((_, k) => runs.every((r, j) => j === i || runs[i][k].gain >= r[k].gain)).length }));
  return { rows, winners, wins, runs };
}

type Comparison = ReturnType<typeof compareStrategies>;

const rp = (n: number) => `Rp${(Math.round(n / 1000) / 1000).toFixed(2)}M`;
const rb = (n: number) => `Rp${Math.round(n / 1000)}k`;

/** A markdown report of a comparison, best first, with each strategy measured against the baseline seed by seed. */
export function formatReport(c: Comparison, seeds: number[], days: number, strategies: Strategy[] = STRATEGIES, title = 'Balance sweep'): string {
  const baseIndex = strategies.findIndex((s) => s.name === 'baseline');
  const lines = [
    `# ${title}: ${strategies.length} strategies, ${seeds.length} seeds (${seeds.join(', ')}), ${days} days`,
    '',
    'Gain is net worth at the end minus at the start: bank, drawer, stock and pantry at cost, minus what is owed. Equipment (the freezer) counts as spent.',
    '',
    '| Strategy | Median gain | Worst | Best | vs baseline (seeds beaten) | Reputation | Served/day | Walkaways/day | Stockout declines/day | Waste/day |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  const order = c.rows.map((r, i) => ({ r, i })).sort((a, b) => b.r.median - a.r.median);
  for (const { r, i } of order) {
    const beaten = baseIndex < 0 || i === baseIndex ? '-' : `${seeds.filter((_, k) => c.runs[i][k].gain > c.runs[baseIndex][k].gain).length}/${seeds.length}`;
    lines.push(
      `| ${r.name} | ${rp(r.median)} | ${rp(r.min)} | ${rp(r.max)} | ${beaten} | ${r.reputation.toFixed(1)} | ${r.served.toFixed(1)} | ${r.walkaways.toFixed(1)} | ${r.declines.toFixed(1)} | ${rb(r.waste)} |`,
    );
  }
  lines.push('', c.winners.length === 0 ? '**Gate 3 holds:** no strategy beats every other strategy on every seed.' : `**Gate 3 fails:** ${c.winners.join(', ')} beats every other strategy on every seed.`, '');
  lines.push('Seeds won (best gain on that seed): ' + c.wins.map((w) => `${w.name} ${w.seedsWon}`).join(', '), '');
  lines.push('What each strategy does:', ...strategies.map((s) => `- **${s.name}**: ${s.note}`));
  return lines.join('\n') + '\n';
}
