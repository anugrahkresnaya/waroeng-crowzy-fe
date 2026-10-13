import Dexie, { type EntityTable } from "dexie";
import { createSave, parseSave, type Game, type Phase, type SaveParse } from "@/engine";

/**
 * Saves live in IndexedDB (via Dexie). One slot, "main", holds the current game; "backup"
 * holds whatever "main" was before a new game replaced it, so nothing is destroyed by accident.
 * What is stored is the engine's save envelope, which versions and validates itself (engine/save.ts).
 */
interface SaveRecord {
  id: "main" | "backup";
  savedAt: number;
  data: unknown;
}

class WarungDb extends Dexie {
  saves!: EntityTable<SaveRecord, "id">;

  constructor(name: string) {
    super(name);
    this.version(1).stores({ saves: "id" });
  }
}

let db: WarungDb | null = null;
let dbName = "warung";

function getDb(): WarungDb {
  return (db ??= new WarungDb(dbName));
}

/** Tests point the module at a throwaway database. */
export function useDatabase(name: string): void {
  db?.close();
  db = null;
  dbName = name;
}

export type SavePeek =
  | { status: "none" }
  | { status: "ok"; day: number; phase: Phase; savedAt: number }
  | { status: "invalid" | "newer" | "outdated"; savedAt: number }
  | { status: "unavailable" };

/** The saved game, parsed. Null when there is no save at all. */
export async function readSave(): Promise<SaveParse | null> {
  const record = await getDb().saves.get("main");
  return record ? parseSave(record.data) : null;
}

/** A light look at the save for the title screen. Never throws: storage can be blocked. */
export async function peekSave(): Promise<SavePeek> {
  try {
    const record = await getDb().saves.get("main");
    if (!record) return { status: "none" };
    const parsed = parseSave(record.data);
    if (!parsed.ok) return { status: parsed.reason, savedAt: record.savedAt };
    return { status: "ok", day: parsed.save.state.day, phase: parsed.save.state.phase, savedAt: parsed.save.savedAt };
  } catch {
    return { status: "unavailable" };
  }
}

/** Writes the current game to the main slot. Returns false when storage refuses (private mode, full disk). */
export async function writeSave(game: Game): Promise<boolean> {
  try {
    const savedAt = Date.now();
    await getDb().saves.put({ id: "main", savedAt, data: createSave(game, savedAt) });
    return true;
  } catch (error) {
    console.warn("Could not save the game", error);
    return false;
  }
}

/** Moves the main save to the backup slot, ready for a new game. */
export async function replaceSave(): Promise<void> {
  try {
    const database = getDb();
    await database.transaction("rw", database.saves, async () => {
      const current = await database.saves.get("main");
      if (current) {
        await database.saves.put({ ...current, id: "backup" });
        await database.saves.delete("main");
      }
    });
  } catch (error) {
    console.warn("Could not back up the old save", error);
  }
}

export async function deleteSave(): Promise<void> {
  try {
    await getDb().saves.delete("main");
  } catch {
    /* nothing to delete if storage is unavailable */
  }
}

/** Asks the browser not to evict our data. Best effort, and harmless if refused. */
export function requestPersistentStorage(): void {
  if (typeof navigator !== "undefined" && navigator.storage?.persist) void navigator.storage.persist().catch(() => undefined);
}
