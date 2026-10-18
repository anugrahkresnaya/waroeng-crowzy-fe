import { assignStorage, addLot, emptyMarket, initMarket } from './market';
import { clonePieces } from './money';
import { Rng, seedToState } from './rng';
import type { Content } from './schema';
import type { GameState, Stats } from './types';

export function freshStats(content: Content): Stats {
  const { openMinute, closeMinute } = content.balance;
  return {
    served: 0,
    walkaways: 0,
    turnedAway: 0,
    leftAtClose: 0,
    itemsSold: {},
    cashRevenue: 0,
    qrisRevenue: 0,
    qrisFees: 0,
    kasbonCredit: 0,
    kasbonRefused: 0,
    wrongTrays: 0,
    stockoutDeclines: 0,
    underageSales: 0,
    overChange: 0,
    shortChangeCaught: 0,
    shortChangeUnnoticed: 0,
    shortChangeGained: 0,
    cogs: 0,
    waste: 0,
    cooking: { kurang: 0, pas: 0, gosong: 0, biasa: 0 },
    obralRevenue: 0,
    givenRep: 0,
    exchangeFees: 0,
    qrisFake: 0,
    qrisRefused: 0,
    titipanSold: 0,
    titipanReturned: 0,
    titipanPaid: 0,
    salesByHour: new Array(Math.ceil((closeMinute - openMinute) / 60)).fill(0),
    moods: { happy: 0, neutral: 0, annoyed: 0 },
  };
}

export function createInitialState(content: Content, seed: number, day = 0): GameState {
  const startsOff = !content.balance.defaultWorkDays[((day % 7) + 7) % 7];
  const startDrawer: Record<number, number> = {};
  for (const [denom, count] of Object.entries(content.balance.startDrawer)) startDrawer[Number(denom)] = count;
  const state: GameState = {
    version: 1,
    seed,
    rng: seedToState(seed),
    tick: 0,
    day,
    minute: startsOff ? content.balance.offBlocks[0].start : content.balance.openMinute,
    phase: startsOff ? 'dayoff' : 'idle',
    shelfReady: false,
    mood: content.balance.start.mood,
    hunger: content.balance.start.hunger,
    workDays: [...content.balance.defaultWorkDays],
    offPlan: Object.fromEntries(content.balance.offBlocks.map((b) => [b.id, [...(content.balance.defaultOffPlan[b.id] ?? [])]])),
    blockIndex: 0,
    tomorrowOpen: null,
    planConfirmed: false,
    preOpenUsed: 0,
    busyUntil: 0,
    drawer: clonePieces(startDrawer),
    bank: content.balance.start.bank,
    kasbon: [],
    market: emptyMarket(),
    pantry: [],
    stock: {},
    goodsCost: {},
    menu: Object.fromEntries(content.items.filter((i) => i.kind === 'dish').map((i) => [i.id, { price: i.price, portion: 'normal' as const }])),
    display: {},
    titipan: { taken: {}, owed: 0, relation: 0 },
    freezer: false,
    phone: { battery: content.balance.phone.start.battery, powerbank: null, data: content.balance.phone.start.data },
    qrisPending: [],
    token: content.balance.token.start,
    tokenOffMinutes: 0,
    bills: Object.fromEntries(content.balance.bills.map((b) => [b.id, { dueDay: day + b.firstDue }])),
    outage: null,
    lantern: false,
    burners: Array.from({ length: content.balance.burners }, () => null),
    skill: {},
    orders: [],
    nextOrderId: 1,
    lastSpoiled: [],
    reputation: content.balance.startReputation,
    line: [],
    nextCustomerId: 1,
    stats: freshStats(content),
  };
  // A month of price history exists before day one, and the shelves start stocked.
  initMarket(state, content, new Rng(state));
  for (const [id, units] of Object.entries(content.balance.start.pantry)) {
    const ing = content.ingredientById[id];
    addLot(state, id, units * ing.unitSize, state.market.prices[id] / ing.unitSize);
  }
  for (const item of content.items) {
    if (item.kind !== 'good') continue;
    state.stock[item.id] = content.balance.start.goods[item.id] ?? 0;
    state.goodsCost[item.id] = item.buyPrice ?? 0;
  }
  assignStorage(state, content);
  return state;
}
