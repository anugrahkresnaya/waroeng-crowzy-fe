import type { Pieces } from './money';

export type { Pieces };

export type PaymentMethod = 'cash' | 'qris' | 'kasbon';
export type Mood = 'happy' | 'neutral' | 'annoyed';
export type Stage = 'ordering' | 'paying' | 'change';
export type Phase = 'idle' | 'open' | 'ended';

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
  /** Minutes of the pre-open block already spent (preparing, exchanging cash). */
  preOpenUsed: number;
  /** Tick when shelf restocking finishes, 0 when not restocking. */
  busyUntil: number;
  drawer: Pieces;
  bank: number;
  kasbon: KasbonEntry[];
  stock: Record<string, number>;
  reputation: number;
  /** line[0] is at the counter. */
  line: Customer[];
  nextCustomerId: number;
  stats: Stats;
}

export type Command =
  | { type: 'open'; prepared: boolean }
  | { type: 'restockShelves' }
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
  | 'invalid_amount';

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
