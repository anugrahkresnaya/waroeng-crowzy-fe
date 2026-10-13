import { create } from "zustand";
import type { Pieces } from "@/engine";

/** Counter state that is not game state: the change being counted out, and the shelf tab. */
interface CounterUi {
  given: Pieces;
  category: "makanan" | "minuman" | "lainnya";
  setCategory: (c: CounterUi["category"]) => void;
  addPiece: (denom: number) => void;
  removePiece: (denom: number) => void;
  clear: () => void;
}

export const useCounterUi = create<CounterUi>((set) => ({
  given: {},
  category: "makanan",
  setCategory: (category) => set({ category }),
  addPiece: (d) => set((s) => ({ given: { ...s.given, [d]: (s.given[d] ?? 0) + 1 } })),
  removePiece: (d) =>
    set((s) => {
      const next = { ...s.given, [d]: (s.given[d] ?? 0) - 1 };
      if (next[d] <= 0) delete next[d];
      return { given: next };
    }),
  clear: () => set({ given: {} }),
}));
