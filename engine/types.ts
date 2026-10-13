import type { Pieces } from './money';
import type { Portion } from './schema';

export type { Pieces, Portion };

export type PaymentMethod = 'cash' | 'qris' | 'kasbon';
export type Mood = 'happy' | 'neutral' | 'annoyed';
export type Stage = 'ordering' | 'paying' | 'change';
/** idle: before opening. open: shop live. ended: day summary. dayoff: day-off blocks. night: free time. bed: tomorrow's decision. */
export type Phase = 'idle' | 'open' | 'ended' | 'dayoff' | 'night' | 'bed';

export interface OrderLine {
  itemId: string;
  qty: number;
}

export interface Customer {
  id: number;
  type: string;
  age: number;
  /** What the customer asked for. */
  order: OrderLine[];
  /** What the player has picked so far, itemId -> qty. */
  tray: Record<string, number>;
  /** Game minutes left before they walk away. */
  patience: number;
  maxPatience: number;
  arrivedAt: number;
  stage: Stage;
  method: PaymentMethod;
  bill: number;
  /** Cash the customer hands over (empty unless method is cash). */
  tender: Pieces;
  ktpChecked: boolean;
}

/** A purchase of one ingredient that is still in the pantry. Quantities are in the ingredient's base unit. */
export interface Lot {
  ingredient: string;
  qty: number;
  /** The day it arrived. */
  bought: number;
  /** What one base unit cost, so used-up stock can be costed. */
  unitCost: number;
  /** Where it is kept, decided each night: the small fridge has limited room. */
  stored: 'room' | 'fridge';
}

export interface MarketEvent {
  id: string;
  /** The first day its effect is felt. */
  start: number;
  /** The last day its effect is felt, or null for a permanent step. */
  end: number | null;
}

export interface NewsItem {
  /** The day the headline was heard. */
  day: number;
  event: string;
  /** The day the price starts to move. */
  startsOn: number;
}

export interface MarketState {
  /** Today's market price per sold unit, by product key (ingredient id, or `g-<item>` for a good). */
  prices: Record<string, number>;
  /** Daily wobble around the base price, as a fraction. It pulls back toward zero each day. */
  noise: Record<string, number>;
  /** The last 30 days of prices, oldest first, ending today. */
  history: Record<string, number[]>;
  active: MarketEvent[];
  pending: MarketEvent[];
  news: NewsItem[];
}

export interface PurchaseLine {
  /** Product key: an ingredient id, or `g-<item>` for a resale good. */
  key: string;
  /** Sold units (kg, pack, dus). */
  qty: number;
  unitPrice: number;
}

export interface Order {
  id: number;
  supplier: string;
  lines: PurchaseLine[];
  subtotal: number;
  fee: number;
  total: number;
  express: boolean;
  placedDay: number;
  arriveDay: number;
  /** Only express orders arrive at a particular minute; the rest arrive in the morning. */
  arriveMinute: number;
  /** Whether a delivery that was due has been pushed back a day. */
  late: boolean;
  lateRolled: boolean;
  status: 'transit' | 'delivered';
  deliveredDay: number | null;
}

export interface MenuEntry {
  price: number;
  portion: Portion;
}

export interface Spoiled {
  ingredient: string;
  /** In sold units. */
  qty: number;
  value: number;
}

export interface KasbonEntry {
  customerId: number;
  type: string;
  amount: number;
  day: number;
}

export interface Stats {
  served: number;
  walkaways: number;
  turnedAway: number;
  leftAtClose: number;
  itemsSold: Record<string, number>;
  cashRevenue: number;
  /** QRIS money that reached the bank, after the fee. */
  qrisRevenue: number;
  qrisFees: number;
  /** Sales written in the kasbon book, not yet paid. */
  kasbonCredit: number;
  kasbonRefused: number;
  wrongTrays: number;
  stockoutDeclines: number;
  underageSales: number;
  /** Rupiah given back above what was due. */
  overChange: number;
  shortChangeCaught: number;
  shortChangeUnnoticed: number;
  /** Rupiah kept by short-changing without being caught. */
  shortChangeGained: number;
  /** What the ingredients and goods that were sold cost to buy. */
  cogs: number;
  /** Rupiah paid as fee when exchanging big notes for small ones. */
  exchangeFees: number;
  /** Gross sales per open hour, index 0 is the first hour after opening. */
  salesByHour: number[];
  moods: Record<Mood, number>;
}

export interface GameState {
  /** Bump when the shape changes, then add a migration. */
  version: 1;
  seed: number;
  /** Random generator state, so a saved game resumes the same sequence. */
  rng: number;
  /** Game minutes elapsed while open. */
  tick: number;
  day: number;
  /** Minute of the day, 0 to 1439. */
  minute: number;
  phase: Phase;
  shelfReady: boolean;
  /** 0 to 100, higher is better. Restored by rest, free time and good days. */
  mood: number;
  /** 0 to 100, higher is hungrier. Rises with time, drops when eating. */
  hunger: number;
  /** Work (true) or day off (false) for each weekday, Monday first. */
  workDays: boolean[];
  /** What the player does in each day-off block, by block id. */
  offPlan: Record<string, string[]>;
  /** Which day-off block is next (dayoff phase). */
  blockIndex: number;
  /** The player's answer to "open tomorrow?", null until asked. */
  tomorrowOpen: boolean | null;
  /** Whether this week's plan was confirmed on Sunday night. */
  planConfirmed: boolean;
  market: MarketState;
  /** Ingredients in the pantry, oldest first. */
  pantry: Lot[];
  /** Resale goods on the shelf, in pieces. */
  stock: Record<string, number>;
  /** Average cost per piece of the goods on the shelf. */
  goodsCost: Record<string, number>;
  /** The player's menu: price and portion size for each dish. */
  menu: Record<string, MenuEntry>;
  orders: Order[];
  nextOrderId: number;
  /** What spoiled overnight, to tell the player in the morning. */
  lastSpoiled: Spoiled[];
  /** Minutes of the pre-open block already spent (preparing, exchanging cash). */
  preOpenUsed: number;
  /** Tick when shelf restocking finishes, 0 when not restocking. */
  busyUntil: number;
  drawer: Pieces;
  bank: number;
  kasbon: KasbonEntry[];
  reputation: number;
  /** line[0] is at the counter. */
  line: Customer[];
  nextCustomerId: number;
  stats: Stats;
}

export type Command =
  | { type: 'open'; prepared: boolean }
  | { type: 'restockShelves' }
  | { type: 'placeOrder'; supplier: string; lines: Array<{ key: string; qty: number }>; express: boolean }
  | { type: 'pasarTrip'; lines: Array<{ key: string; qty: number }> }
  | { type: 'setDishPrice'; item: string; price: number }
  | { type: 'setPortion'; item: string; portion: Portion }
  | { type: 'depositCash'; pieces: Pieces }
  | { type: 'withdrawCash'; amount: number }
  | { type: 'goToNight' }
  | { type: 'setPlan'; day: number; work: boolean }
  | { type: 'setBlock'; block: string; activities: string[] }
  | { type: 'confirmPlan' }
  | { type: 'runBlock' }
  | { type: 'spendFreeTime'; activities: string[] }
  | { type: 'decideTomorrow'; open: boolean }
  | { type: 'exchangeCash'; amount: number }
  | { type: 'nextDay' }
  | { type: 'pick'; itemId: string }
  | { type: 'unpick'; itemId: string }
  | { type: 'declineItem'; itemId: string }
  | { type: 'checkKtp' }
  | { type: 'confirmOrder' }
  | { type: 'confirmQris' }
  | { type: 'grantKasbon' }
  | { type: 'refuseKasbon' }
  | { type: 'giveChange'; pieces: Pieces }
  | { type: 'closeWarung' };

export type CommandError =
  | 'wrong_phase'
  | 'busy'
  | 'shelves_not_ready'
  | 'shelves_ready'
  | 'no_customer'
  | 'wrong_stage'
  | 'wrong_method'
  | 'unknown_item'
  | 'out_of_stock'
  | 'not_in_tray'
  | 'not_in_order'
  | 'already_checked'
  | 'invalid_pieces'
  | 'not_in_drawer'
  | 'no_time'
  | 'invalid_amount'
  | 'too_many_days_off'
  | 'invalid_block'
  | 'invalid_activities'
  | 'insufficient_funds'
  | 'below_minimum'
  | 'empty_order'
  | 'unknown_supplier'
  | 'unknown_product'
  | 'invalid_quantity'
  | 'no_pasar_trip'
  | 'not_a_dish'
  | 'invalid_price';

export type WalkawayReason = 'patience' | 'closing' | 'empty_order' | 'kasbon_refused';

export type GameEvent =
  | { type: 'opened' }
  | { type: 'shelves_ready' }
  | { type: 'customer_arrived'; customerId: number; customerType: string }
  | { type: 'turned_away' }
  | { type: 'walkaway'; customerId: number; reason: WalkawayReason }
  | { type: 'order_mismatch'; customerId: number }
  | { type: 'sale'; customerId: number; bill: number; method: PaymentMethod; mood: Mood }
  | { type: 'short_change_caught'; customerId: number; short: number }
  | { type: 'underage_sale'; customerId: number }
  | { type: 'exchanged'; amount: number; fee: number }
  | { type: 'new_day'; day: number }
  | { type: 'block_done'; block: string; cash: number }
  | { type: 'free_time_done' }
  | { type: 'unplanned_closure' }
  | { type: 'order_placed'; orderId: number; total: number }
  | { type: 'order_delivered'; orderId: number }
  | { type: 'order_late'; orderId: number; arriveDay: number }
  | { type: 'pasar_bought'; total: number }
  | { type: 'spoiled'; value: number }
  | { type: 'news'; event: string }
  | { type: 'closed' };

export type CommandResult = { ok: true; events: GameEvent[] } | { ok: false; error: CommandError };

export interface LoggedCommand {
  /** state.tick when the command was accepted. */
  tick: number;
  command: Command;
}

export interface DaySummary {
  day: number;
  served: number;
  walkaways: number;
  turnedAway: number;
  leftAtClose: number;
  /** Everything sold, before the QRIS fee, including kasbon. */
  grossSales: number;
  /** What the ingredients and goods that were sold cost, and the profit after that and the QRIS fees. */
  cogs: number;
  netProfit: number;
  cashRevenue: number;
  qrisRevenue: number;
  qrisFees: number;
  kasbonCredit: number;
  changeErrors: { overChange: number; shortCaught: number; shortUnnoticed: number };
  stockoutDeclines: number;
  underageSales: number;
  exchangeFees: number;
  salesByHour: number[];
  stockLeft: Record<string, number>;
  drawerTotal: number;
  bank: number;
  reputation: number;
  moods: Record<Mood, number>;
}
