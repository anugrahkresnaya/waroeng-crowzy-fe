import { create } from "zustand";

/** The shopping basket of the market app. It lives in memory only; a reload empties it. */
interface CartStore {
  supplier: string;
  express: boolean;
  /** Product key to sold units. */
  lines: Record<string, number>;
  setSupplier: (id: string) => void;
  setExpress: (on: boolean) => void;
  setQty: (key: string, qty: number) => void;
  add: (key: string, by?: number) => void;
  clear: () => void;
}

export const useCart = create<CartStore>((set) => ({
  supplier: "pak-slamet",
  express: false,
  lines: {},
  setSupplier: (supplier) => set({ supplier }),
  setExpress: (express) => set({ express }),
  setQty: (key, qty) =>
    set((s) => {
      const lines = { ...s.lines };
      if (qty <= 0) delete lines[key];
      else lines[key] = Math.floor(qty);
      return { lines };
    }),
  add: (key, by = 1) => set((s) => ({ lines: { ...s.lines, [key]: Math.max(1, (s.lines[key] ?? 0) + by) } })),
  clear: () => set({ lines: {}, express: false }),
}));

/** The cart as the engine wants it: lines with a positive quantity. */
export const cartLines = (lines: Record<string, number>) => Object.entries(lines).filter(([, q]) => q > 0).map(([key, qty]) => ({ key, qty }));
