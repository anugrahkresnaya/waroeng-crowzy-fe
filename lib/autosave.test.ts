import { describe, expect, it } from "vitest";
import { Game, content } from "@/engine";
import { SAVE_DELAY_MS, createAutosaver } from "@/lib/autosave";

function harness() {
  const saved: Game[] = [];
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let next = 0;
  const saver = createAutosaver({
    save: (g) => saved.push(g),
    schedule: (fn, ms) => {
      timers.set(++next, { fn, ms });
      return next;
    },
    cancel: (h) => void timers.delete(h as number),
  });
  const fire = () => {
    const due = [...timers.values()];
    timers.clear();
    due.forEach((t) => t.fn());
  };
  return { saver, saved, timers, fire };
}

const snap = (game: Game | null) => ({ game, state: game ? game.snapshot() : null });

describe("autosave timing", () => {
  it("saves a new game at once", () => {
    const h = harness();
    const g = new Game(content, { seed: 1 });
    h.saver.onChange(snap(g), snap(null));
    expect(h.saved).toEqual([g]);
    expect(h.timers.size).toBe(0);
  });

  it("batches ordinary changes into one delayed write", () => {
    const h = harness();
    const g = new Game(content, { seed: 1 });
    g.dispatch({ type: "open", prepared: true });
    let prev = snap(g);
    h.saver.onChange(prev, snap(null));
    h.saved.length = 0;

    for (let i = 0; i < 30; i++) {
      g.tick();
      const cur = { game: g, state: g.snapshot() };
      h.saver.onChange(cur, prev);
      prev = cur;
    }
    expect(h.saved).toHaveLength(0);
    expect(h.timers.size).toBe(1);
    expect([...h.timers.values()][0].ms).toBe(SAVE_DELAY_MS);
    h.fire();
    expect(h.saved).toEqual([g]);
    expect(h.saver.pending).toBe(false);
  });

  it("saves immediately when the phase changes, and drops the pending write", () => {
    const h = harness();
    const g = new Game(content, { seed: 1 });
    g.dispatch({ type: "open", prepared: true });
    const before = snap(g);
    h.saver.onChange(before, snap(null));
    h.saved.length = 0;

    g.tick();
    const mid = snap(g);
    h.saver.onChange(mid, before);
    expect(h.timers.size).toBe(1);

    g.dispatch({ type: "closeWarung" });
    h.saver.onChange(snap(g), mid);
    expect(h.saved).toHaveLength(1);
    expect(h.timers.size).toBe(0);
  });

  it("ignores updates that change nothing, and updates with no game", () => {
    const h = harness();
    const g = new Game(content, { seed: 1 });
    const s = snap(g);
    h.saver.onChange(s, s);
    h.saver.onChange(snap(null), snap(null));
    expect(h.saved).toHaveLength(0);
    expect(h.timers.size).toBe(0);
  });

  it("flush writes what is pending when the tab is hidden", () => {
    const h = harness();
    const g = new Game(content, { seed: 1 });
    g.dispatch({ type: "open", prepared: true });
    const a = snap(g);
    h.saver.onChange(a, snap(null));
    h.saved.length = 0;
    g.tick();
    h.saver.onChange(snap(g), a);
    expect(h.saver.pending).toBe(true);
    h.saver.flush(g);
    expect(h.saved).toEqual([g]);
    expect(h.timers.size).toBe(0);
    h.saver.flush(g); // nothing left to write
    expect(h.saved).toHaveLength(1);
  });
});
