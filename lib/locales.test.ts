import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../locales/en.json";
import id from "../locales/id.json";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([k, v]) => (typeof v === "string" ? [prefix + k] : flatten(v, `${prefix}${k}.`)));
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" || name === ".next" ? [] : sourceFiles(path);
    return /\.(tsx?|ts)$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });
}

const idKeys = new Set(flatten(id));
const enKeys = new Set(flatten(en));

describe("translations", () => {
  it("has the same keys in Indonesian and English", () => {
    expect([...idKeys].filter((k) => !enKeys.has(k))).toEqual([]);
    expect([...enKeys].filter((k) => !idKeys.has(k))).toEqual([]);
  });

  it("has every string key the screens ask for", () => {
    const used = new Set<string>();
    for (const dir of ["app", "components", "lib"]) {
      for (const file of sourceFiles(join(process.cwd(), dir))) {
        for (const m of readFileSync(file, "utf8").matchAll(/\bt\(\s*["']([a-zA-Z0-9_.]+)["']/g)) used.add(m[1]);
      }
    }
    expect([...used].filter((k) => !idKeys.has(k))).toEqual([]);
    expect(used.size).toBeGreaterThan(40);
  });

  it("covers the keys built at runtime", () => {
    const dynamic = [
      ...[0, 1, 2, 3, 4, 5, 6].map((n) => `weekday.${n}`),
      ...["makanan", "minuman", "lainnya"].map((c) => `category.${c}`),
      ...["happy", "neutral", "annoyed"].map((m) => `toast.sale.${m}`),
      ...["patience", "empty_order", "kasbon_refused", "qris_refused"].map((r) => `toast.walkaway.${r}`),
      ...[
        "wrong_phase", "busy", "shelves_not_ready", "shelves_ready", "no_customer", "wrong_stage", "wrong_method",
        "unknown_item", "out_of_stock", "not_in_tray", "not_in_order", "already_checked", "invalid_pieces",
        "not_in_drawer", "no_time", "invalid_amount", "out_of_gas", "no_ice", "no_outage", "already_owned", "unknown_bill", "not_due_yet", "cannot_verify", "can_verify", "phone_dead", "no_data", "needs_freezer", "freezer_full", "not_unlocked", "owes_neighbor", "not_consigned", "titipan_full", "nothing_owed",
      ].map((e) => `toast.error.${e}`),
      ...[0, 1, 2, 3, 4, 5, 6].map((n) => `weekdayShort.${n}`),
      ...["pagi", "siang", "sore", "malam"].flatMap((b) => [`block.${b}`, `toast.blockDone.${b}`]),
      ...["too_many_days_off", "invalid_block", "invalid_activities"].map((e) => `toast.error.${e}`),
      ...["idle", "open", "ended", "night", "bed", "dayoff"].map((ph) => `phase.${ph}`),
      ...["all", "pokok", "protein", "sayur", "minuman", "perlengkapan"].map((c) => `pasar.category.${c}`),
      ...["harvest-failure", "fuel-hike", "flood", "lpg-shortage", "market-operation"].flatMap((e) => [`pasar.event.${e}`, `pasar.news.${e}`, `toast.news.${e}`]),
      ...["ramadan", "mudik", "lebaran", "christmas", "new-year", "independence", "long-weekend"].flatMap((e) => [`toast.season.${e}.now`, `toast.season.${e}.soon`]),
      ...["small", "normal", "large"].map((p) => `menu.portions.${p}`),
      ...["bahan", "barang", "pesanan"].map((x) => `storage.tabs.${x}`),
      ...["insufficient_funds", "below_minimum", "empty_order", "unknown_supplier", "unknown_product", "invalid_quantity", "no_pasar_trip", "not_a_dish", "invalid_price"].map((e) => `toast.error.${e}`),
      ...["signal", "data", "battery"].map((r) => `qris.reason.${r}`),
      ...["good", "slow", "down"].map((x) => `phone.signal.${x}`),
      ...["not_unlocked", "wrong_phase", "owes_neighbor", "no_time", "titipan_full"].map((e) => `titipan.why.${e}`),
      ...["today", "tomorrow", "soon"].map((w) => `toast.when.${w}`),
      ...["no_time", "busy", "wrong_phase", "insufficient_funds"].map((e) => `outage.why.${e}`),
      ...["auto", "light", "dark"].map((th) => `title.theme_${th}`),
      ...[1, 2, 3, 4].flatMap((n) => [`chapters.${n}.name`, `chapters.${n}.desc`]),
      ...["siapkan", "tukar", "ojol", "tidur"].flatMap((o) => [`home.options.${o}.name`, `home.options.${o}.desc`]),
      ...["chat", "bank", "ojol", "pasar", "jadwal", "buku-kas", "layanan", "berita"].map((a) => `phone.apps.${a}`),
    ];
    expect(dynamic.filter((k) => !idKeys.has(k))).toEqual([]);
  });
});
