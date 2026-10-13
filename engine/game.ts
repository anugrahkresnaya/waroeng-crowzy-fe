import { advance, handleCommand, type Ctx } from './counter';
import { createInitialState } from './state';
import { Rng } from './rng';
import type { Content } from './schema';
import type {
  Command, CommandResult, DaySummary, GameEvent, GameState, LoggedCommand,
} from './types';
import { total } from './money';

/**
 * One run of the game. All state is a plain object in `state`; all randomness comes from
 * `state.rng`. Feed it the same seed and the same commands at the same ticks and it
 * produces the same state, so runs can be replayed, verified and tested headless.
 */
export class Game {
  readonly content: Content;
  state: GameState;
  /** Accepted commands, in order. Replaying this log from the same seed rebuilds `state`. */
  readonly log: LoggedCommand[] = [];
  /** The day number the run started on, needed to replay it. */
  readonly startDay: number;

  private readonly rng: Rng;

  constructor(
    content: Content,
    init: { seed: number; day?: number } | { state: GameState; log?: readonly LoggedCommand[]; startDay?: number },
  ) {
    this.content = content;
    if ('state' in init) {
      this.state = init.state;
      this.startDay = init.startDay ?? 0;
      if (init.log) this.log.push(...init.log);
    } else {
      this.startDay = init.day ?? 0;
      this.state = createInitialState(content, init.seed, init.day);
    }
    this.rng = new Rng(this.state);
  }

  /** Rebuilds a game from a saved snapshot (a JSON round trip of `state` is fine). */
  static fromSnapshot(content: Content, snapshot: GameState, log: readonly LoggedCommand[] = [], startDay = 0): Game {
    return new Game(content, { state: structuredClone(snapshot), log: structuredClone(log), startDay });
  }

  snapshot(): GameState {
    return structuredClone(this.state);
  }

  dispatch(command: Command): CommandResult {
    const events: GameEvent[] = [];
    const result = handleCommand(this.ctx(events), command);
    if (!result.ok) return result;
    this.log.push({ tick: this.state.tick, command: structuredClone(command) });
    return { ok: true, events };
  }

  /** Advances the open warung by one game minute. Does nothing unless the warung is open. */
  tick(): GameEvent[] {
    const events: GameEvent[] = [];
    advance(this.ctx(events));
    return events;
  }

  /** The UI can fast-forward when this is true: quiet hours with nobody in line. */
  canFastForward(): boolean {
    const { state } = this;
    if (state.phase !== 'open' || state.line.length > 0) return false;
    const m = state.minute;
    return (m >= 14 * 60 && m < 17 * 60) || (m >= 20 * 60 && m < 22 * 60);
  }

  summary(): DaySummary {
    const { state } = this;
    const s = state.stats;
    return {
      day: state.day,
      served: s.served,
      walkaways: s.walkaways,
      turnedAway: s.turnedAway,
      leftAtClose: s.leftAtClose,
      grossSales: s.cashRevenue + s.qrisRevenue + s.qrisFees + s.kasbonCredit,
      cogs: Math.round(s.cogs),
      netProfit: Math.round(s.cashRevenue + s.qrisRevenue + s.kasbonCredit - s.cogs),
      cashRevenue: s.cashRevenue,
      qrisRevenue: s.qrisRevenue,
      qrisFees: s.qrisFees,
      kasbonCredit: s.kasbonCredit,
      changeErrors: { overChange: s.overChange, shortCaught: s.shortChangeCaught, shortUnnoticed: s.shortChangeUnnoticed },
      stockoutDeclines: s.stockoutDeclines,
      underageSales: s.underageSales,
      exchangeFees: s.exchangeFees,
      salesByHour: [...s.salesByHour],
      stockLeft: { ...state.stock },
      drawerTotal: total(state.drawer),
      bank: state.bank,
      reputation: state.reputation,
      moods: { ...s.moods },
    };
  }

  private ctx(events: GameEvent[]): Ctx {
    return { state: this.state, content: this.content, rng: this.rng, emit: (e) => events.push(e) };
  }
}
