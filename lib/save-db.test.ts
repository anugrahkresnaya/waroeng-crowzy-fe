import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, describe, expect, it } from "vitest";
import { Game, SAVE_FORMAT, content } from "@/engine";
import { deleteSave, peekSave, readSave, replaceSave, useDatabase, writeSave } from "@/lib/save-db";

let n = 0;
beforeEach(() => useDatabase(`test-${++n}`));

/** Writes a record straight into the database, the way an older or broken version might have. */
async function plant(id: "main" | "backup", data: unknown) {
  const raw = new Dexie(`test-${n}`);
  raw.version(1).stores({ saves: "id" });
  await raw.table("saves").put({ id, savedAt: 1700000000000, data });
  raw.close();
}

function playedGame() {
  const g = new Game(content, { seed: 5 });
  g.dispatch({ type: "open", prepared: true });
  for (let i = 0; i < 120; i++) g.tick();
  return g;
}

describe("save database", () => {
  it("has nothing to read before the first save", async () => {
    expect(await readSave()).toBeNull();
    expect(await peekSave()).toEqual({ status: "none" });
  });

  it("writes and reads back the whole game", async () => {
    const g = playedGame();
    expect(await writeSave(g)).toBe(true);
    const saved = await readSave();
    expect(saved?.ok).toBe(true);
    if (!saved?.ok) return;
    expect(saved.save.state).toEqual(g.snapshot());
    expect(saved.save.log).toEqual(g.log);
    expect(saved.save.format).toBe(SAVE_FORMAT);
  });

  it("peek reports the day, phase and time for the title screen", async () => {
    await writeSave(playedGame());
    const p = await peekSave();
    expect(p).toMatchObject({ status: "ok", day: 0, phase: "open" });
    expect(p.status === "ok" && p.savedAt).toBeGreaterThan(0);
  });

  it("a second save replaces the first", async () => {
    const g = playedGame();
    await writeSave(g);
    g.dispatch({ type: "closeWarung" });
    await writeSave(g);
    expect(await peekSave()).toMatchObject({ status: "ok", phase: "ended" });
  });

  it("starting over keeps the old save as a backup instead of destroying it", async () => {
    await writeSave(playedGame());
    await replaceSave();
    expect(await readSave()).toBeNull();
    const raw = new Dexie(`test-${n}`);
    raw.version(1).stores({ saves: "id" });
    const backup = await raw.table("saves").get("backup");
    raw.close();
    expect(backup?.id).toBe("backup");
    expect(backup?.data.format).toBe(SAVE_FORMAT);
  });

  it("replacing with no save is harmless", async () => {
    await expect(replaceSave()).resolves.toBeUndefined();
  });

  it("flags a damaged save and a save from a newer game, without throwing", async () => {
    await plant("main", { format: SAVE_FORMAT, state: "nonsense" });
    expect(await peekSave()).toMatchObject({ status: "invalid" });
    await plant("main", { format: SAVE_FORMAT + 1 });
    expect(await peekSave()).toMatchObject({ status: "newer" });
    await plant("main", "garbage");
    expect(await peekSave()).toMatchObject({ status: "invalid" });
  });

  it("deleting removes the save", async () => {
    await writeSave(playedGame());
    await deleteSave();
    expect(await peekSave()).toEqual({ status: "none" });
  });
});
