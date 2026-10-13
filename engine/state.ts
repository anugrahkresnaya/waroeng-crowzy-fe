import { clonePieces } from './money';
import { seedToState } from './rng';
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
    exchangeFees: 0,
    salesByHour: new Array(Math.ceil((closeMinute - openMinute) / 60)).fill(0),
    moods: { happy: 0, neutral: 0, annoyed: 0 },
  };
}

export function createInitialState(content: Content, seed: number, day = 0): GameState {
  const startDrawer: Record<number, number> = {};
  for (const [denom, count] of Object.entries(content.balance.startDrawer)) startDrawer[Number(denom)] = count;
  return {
    version: 1,
    seed,
    rng: seedToState(seed),
    tick: 0,
    day,
    minute: content.balance.openMinute,
    phase: 'idle',
    shelfReady: false,
    preOpenUsed: 0,
    busyUntil: 0,
    drawer: clonePieces(startDrawer),
    bank: 0,
    kasbon: [],
    stock: Object.fromEntries(content.items.map((i) => [i.id, i.startStock])),
    reputation: content.balance.startReputation,
    line: [],
    nextCustomerId: 1,
    stats: freshStats(content),
  };
}
