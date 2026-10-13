import { content } from '../content';
import { Game } from '../game';
import { exactPieces, smallestNoteAtLeast, type Pieces } from '../money';
import type { Content } from '../schema';
import type { Customer, OrderLine, PaymentMethod } from '../types';

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
  const bill = spec.order.reduce((s, l) => s + game.content.itemById[l.itemId].price * l.qty, 0);
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
