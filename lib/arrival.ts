import { standardArrivalDay, type Content, type GameState, type Order } from "@/engine";

export type Arrival =
  | { kind: "hours" }
  | { kind: "tomorrowMorning" }
  | { kind: "tomorrow" }
  | { kind: "dayAfter"; weekday: number };

/** When an order placed right now would arrive, in words the app can translate. */
export function arrivalIfPlacedNow(state: GameState, content: Content, express: boolean): Arrival {
  if (express) {
    const resting = state.phase === "ended" || state.phase === "night" || state.phase === "bed";
    const at = state.minute + content.market.ordering.expressMinutes;
    return resting || at >= content.balance.closeMinute ? { kind: "tomorrowMorning" } : { kind: "hours" };
  }
  const day = standardArrivalDay(state, content);
  return day === state.day + 1 ? { kind: "tomorrow" } : { kind: "dayAfter", weekday: day % 7 };
}

export type OrderStatusView =
  | { kind: "delivered"; weekday: number }
  | { kind: "late"; weekday: number }
  | { kind: "hours" }
  | { kind: "tomorrow" }
  | { kind: "later"; weekday: number };

/** Where an order stands, for the Pesanan list. */
export function orderStatus(state: GameState, o: Order): OrderStatusView {
  if (o.status === "delivered") return { kind: "delivered", weekday: (o.deliveredDay ?? o.arriveDay) % 7 };
  if (o.late) return { kind: "late", weekday: o.arriveDay % 7 };
  if (o.express && o.arriveDay === state.day) return { kind: "hours" };
  if (o.arriveDay === state.day + 1) return { kind: "tomorrow" };
  return { kind: "later", weekday: o.arriveDay % 7 };
}
