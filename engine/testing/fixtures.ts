import { content } from '../content';
import { Game } from '../game';
import { ingredientQty, sellPrice } from '../market';
import { exactPieces, smallestNoteAtLeast, type Pieces } from '../money';
import type { Content } from '../schema';
import type { Customer, GameEvent, OrderLine, PaymentMethod } from '../types';

/** Content with arrivals switched off, so scripted scenarios are not disturbed by random customers. */
export function quietContent(base: Content = content, patch: Partial<Content['balance']> = {}): Content {
  return {
    ...base,
    balance: {
      ...base.balance,
      arrivalPerMinute: { morning: 0, lunch: 0, afternoon: 0, evening: 0, night: 0 },
      ...patch,
    },
  };
}

/** An open game with an empty line. */
export function openGame(c: Content = quietContent(), seed = 1, prepared = true): Game {
  const game = new Game(c, { seed });
  game.dispatch({ type: 'open', prepared });
  return game;
}

export interface CustomerSpec {
  type?: string;
  order: OrderLine[];
  method?: PaymentMethod;
  /** Cash handed over. Defaults to the smallest single note that covers the bill. */
  tender?: Pieces;
  age?: number;
  patience?: number;
}

/** Puts a customer at the back of the line with a known order and payment. */
export function addCustomer(game: Game, spec: CustomerSpec): Customer {
  const method = spec.method ?? 'cash';
  const bill = spec.order.reduce((s, l) => s + sellPrice(game.state, game.content.itemById[l.itemId]) * l.qty, 0);
  const patience = spec.patience ?? 30;
  const customer: Customer = {
    id: game.state.nextCustomerId++,
    type: spec.type ?? 'langganan',
    age: spec.age ?? 30,
    order: spec.order,
    tray: {},
    patience,
    maxPatience: patience,
    arrivedAt: game.state.tick,
    stage: 'ordering',
    method,
    bill,
    tender: method === 'cash' ? (spec.tender ?? smallestNoteAtLeast(bill)) : {},
    ktpChecked: false,
  };
  game.state.line.push(customer);
  return customer;
}

/** Picks everything the front customer ordered and confirms the order. */
export function pickAll(game: Game): void {
  const c = game.state.line[0];
  for (const line of c.order) for (let i = 0; i < line.qty; i++) game.dispatch({ type: 'pick', itemId: line.itemId });
  game.dispatch({ type: 'confirmOrder' });
}

export { exactPieces };

/** How much of an ingredient is in the pantry, in its base unit. */
export const pantryQty = (game: Game, ingredient: string) => ingredientQty(game.state, ingredient);

/** Takes an ingredient out of the pantry entirely, to test running out. */
export function runOut(game: Game, ingredient: string): void {
  game.state.pantry = game.state.pantry.filter((l) => l.ingredient !== ingredient);
}

/** Puts plenty of an ingredient in the pantry, bought today, so a test is not limited by stock. */
export function stockUp(game: Game, ingredient: string, baseUnits = 100000, unitCost = 1): void {
  game.state.pantry.push({ ingredient, qty: baseUnits, bought: game.state.day, unitCost, stored: 'room' });
}

/** Lets a day go by with no customers: close the shop (or run the day off), spend no free time, sleep. Returns the morning's events. */
export function passDay(game: Game): GameEvent[] {
  if (game.state.phase === 'idle') {
    game.dispatch({ type: 'open', prepared: false });
    game.dispatch({ type: 'closeWarung' });
  }
  while (game.state.phase === 'dayoff') game.dispatch({ type: 'runBlock' });
  if (game.state.phase === 'ended') game.dispatch({ type: 'goToNight' });
  if (game.state.phase === 'night') game.dispatch({ type: 'spendFreeTime', activities: [] });
  const res = game.dispatch({ type: 'nextDay' });
  return res.ok ? res.events : [];
}
