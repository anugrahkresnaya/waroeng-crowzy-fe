"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppHeader } from "@/components/app-header";
import { CartView } from "@/components/pasar/cart-view";
import { OrdersView } from "@/components/pasar/orders-view";
import { GoodsList, PriceList } from "@/components/pasar/price-list";
import { ProductDetail } from "@/components/pasar/product-detail";
import { Chip } from "@/components/ui";
import { content, onPasarTrip, type Phase } from "@/engine";
import { cartLines, useCart } from "@/lib/cart-store";
import { rp } from "@/lib/format";
import { useGame } from "@/lib/game-store";
import { useGuard } from "@/lib/use-guard";

const ANY: Phase[] = ["idle", "open", "ended", "dayoff", "night", "bed"];
type Tab = "harga" | "barang" | "keranjang" | "pesanan";

/** The market app: prices, what to buy, the basket, and the orders on their way. Works at any hour and takes no time. */
export default function PasarPage() {
  const { t } = useTranslation();
  const ready = useGuard(ANY);
  const state = useGame((s) => s.state);
  const lines = useCart((s) => s.lines);
  const [tab, setTab] = useState<Tab>("harga");
  const [selected, setSelected] = useState<string | null>(null);
  if (!ready || !state) return null;

  const trip = onPasarTrip(state, content);
  const count = cartLines(lines).length;
  const late = state.orders.filter((o) => o.status === "transit" && o.late).length;
  const open = (key: string) => setSelected(key);
  const tabs: Array<[Tab, string]> = [
    ["harga", t("pasar.tabs.harga")],
    ["barang", t("pasar.tabs.barang")],
    ["keranjang", `${t("pasar.tabs.keranjang")}${count ? ` (${count})` : ""}`],
    ["pesanan", `${t("pasar.tabs.pesanan")}${late ? " ⚠" : ""}`],
  ];

  return (
    <>
      <AppHeader title={t("pasar.title")} icon="ikon-app-pasar" right={<span className="font-mono tabular-nums text-muted">{rp(state.bank)}</span>} />
      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 [&>*]:shrink-0">
        {trip && (
          <div className="rounded-xl border border-accent bg-panel p-3 text-xs" data-testid="trip-banner">
            <b>{t("pasar.tripBanner")}</b>
            <span className="text-muted"> {t("pasar.tripBannerHelp")}</span>
          </div>
        )}
        <div className="flex gap-1.5 overflow-x-auto" role="tablist">
          {tabs.map(([id, label]) => (
            <Chip
              key={id}
              role="tab"
              aria-selected={tab === id}
              on={tab === id}
              data-testid={`tab-${id}`}
              onClick={() => {
                setTab(id);
                setSelected(null);
              }}
            >
              {label}
            </Chip>
          ))}
        </div>

        {tab === "harga" && (selected ? <ProductDetail productKey={selected} onBack={() => setSelected(null)} onCart={() => { setTab("keranjang"); setSelected(null); }} /> : <PriceList onOpen={open} />)}
        {tab === "barang" && (selected ? <ProductDetail productKey={selected} onBack={() => setSelected(null)} onCart={() => { setTab("keranjang"); setSelected(null); }} /> : <GoodsList onOpen={open} />)}
        {tab === "keranjang" && <CartView onDone={() => setTab(trip ? "harga" : "pesanan")} />}
        {tab === "pesanan" && <OrdersView />}
      </div>
    </>
  );
}
