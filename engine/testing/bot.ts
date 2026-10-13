// A headless player used by tests and, later, balance checks. It never rolls dice itself,
// so a run is fully decided by the seed and these rules.
import { changeFor } from '../counter';
import { Game } from '../game';
import { payOutBestEffort, addPieces } from '../money';
import type { Command } from '../types';

export interface BotOptions {
  /** Commands the bot can issue per game minute; fractions work (0.25 = one every 4 minutes). */
  actionsPerTick: number;
  prepared?: boolean;
}

/** Issues the next sensible command for the customer at the counter, or returns false if none. */
export function botAct(game: Game): boolean {
  const { state, content } = game;
  const c = state.line[0];
  if (!c || state.busyUntil > 0) return false;
  if (!state.shelfReady) return game.dispatch({ type: 'restockShelves' }).ok;
  const send = (command: Command) => game.dispatch(command).ok;

  if (c.stage === 'ordering') {
    const restricted = c.order.find((l) => content.itemById[l.itemId].ageRestricted);
    if (restricted && !c.ktpChecked) return send({ type: 'checkKtp' });
    if (restricted && c.age < 18) return send({ type: 'declineItem', itemId: restricted.itemId });
    for (const line of c.order) {
      if ((c.tray[line.itemId] ?? 0) >= line.qty) continue;
      const have = (state.stock[line.itemId] ?? 0) - (c.tray[line.itemId] ?? 0);
      if (have <= 0) return send({ type: 'declineItem', itemId: line.itemId });
      return send({ type: 'pick', itemId: line.itemId });
    }
    return send({ type: 'confirmOrder' });
  }
  if (c.stage === 'paying') {
    return send(c.method === 'qris' ? { type: 'confirmQris' } : { type: 'grantKasbon' });
  }
  const pieces = changeFor(state, c) ?? (() => {
    const drawer = { ...state.drawer };
    addPieces(drawer, c.tender);
    const due = Object.entries(c.tender).reduce((s, [d, n]) => s + Number(d) * n, 0) - c.bill;
    return payOutBestEffort(drawer, due);
  })();
  return send({ type: 'giveChange', pieces });
}

/** Plays one whole open day. */
export function playDay(game: Game, options: BotOptions = { actionsPerTick: 4 }): Game {
  game.dispatch({ type: 'open', prepared: options.prepared ?? true });
  let budget = 0;
  while (game.state.phase === 'open') {
    budget = Math.min(budget + options.actionsPerTick, Math.max(1, options.actionsPerTick));
    while (budget >= 1 && botAct(game)) budget -= 1;
    game.tick();
  }
  return game;
}

/** From the end-of-day summary to the start of the next day, the way a player would. */
export function sleepThrough(game: Game, options: { freeTime?: string[]; open?: boolean } = {}): void {
  if (game.state.phase === 'ended') game.dispatch({ type: 'goToNight' });
  game.dispatch({ type: 'spendFreeTime', activities: options.freeTime ?? ['makan'] });
  if (options.open !== undefined) game.dispatch({ type: 'decideTomorrow', open: options.open });
  game.dispatch({ type: 'nextDay' });
}

/** Plays whatever the current day is: a shop day with the bot, or every day-off block. */
export function playAnyDay(game: Game, options: BotOptions = { actionsPerTick: 4 }): void {
  if (game.state.phase === 'dayoff') {
    while (game.state.phase === 'dayoff') game.dispatch({ type: 'runBlock' });
    return;
  }
  playDay(game, options);
}
