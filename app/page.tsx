"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Art } from "@/components/art";
import { PhoneFrame } from "@/components/phone-frame";
import { Button, Card, Chip, Pill } from "@/components/ui";
import { useGame } from "@/lib/game-store";
import { peekSave, replaceSave, type SavePeek } from "@/lib/save-db";
import { HOME } from "@/lib/use-guard";
import { useSettings, type Theme } from "@/lib/settings-store";

const CHAPTERS = [1, 2, 3, 4] as const;
const THEMES: Theme[] = ["auto", "light", "dark"];

export default function TitlePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const start = useGame((s) => s.start);
  const lang = useSettings((s) => s.lang);
  const theme = useSettings((s) => s.theme);
  const setLang = useSettings((s) => s.setLang);
  const setTheme = useSettings((s) => s.setTheme);
  const resume = useGame((s) => s.resume);

  const [peek, setPeek] = useState<SavePeek | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void peekSave().then((p) => live && setPeek(p));
    return () => {
      live = false;
    };
  }, []);

  const hasSave = peek !== null && peek.status !== "none" && peek.status !== "unavailable";

  async function begin() {
    setBusy(true);
    await replaceSave();
    start();
    router.push("/beranda");
  }

  async function carryOn() {
    setBusy(true);
    const result = await resume();
    if (result === "ok") router.push(HOME[useGame.getState().state?.phase ?? "idle"]);
    else {
      setPeek(await peekSave());
      setBusy(false);
    }
  }

  return (
    <PhoneFrame>
      <div className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="relative h-44 shrink-0 overflow-hidden border-b-[3px] border-ink bg-stage">
          <Art id="warung-depan" className="h-full! object-cover" />
        </div>
        <div className="flex flex-col gap-4 p-4">
          <div>
            <div className="font-mono text-xs text-muted">{t("title.eyebrow")}</div>
            <h1 className="font-display text-4xl font-bold leading-none">Warung Hidup</h1>
            <p className="mt-2 text-sm text-muted">{t("title.tagline")}</p>
          </div>

          {peek?.status === "ok" && (
            <Card className="flex items-center gap-3 border-accent! p-3" data-testid="continue-card">
              <div className="flex-1 leading-tight">
                <b className="font-display text-lg">{t("save.continue")}</b>
                <div className="text-xs text-muted" data-testid="continue-info">
                  {t("save.info", { n: peek.day + 1, weekday: t(`weekday.${peek.day % 7}`), phase: t(`phase.${peek.phase}`) })}
                </div>
                <div className="text-[11px] text-muted">{t("save.savedAt", { when: new Date(peek.savedAt).toLocaleString(lang === "en" ? "en-GB" : "id-ID", { dateStyle: "medium", timeStyle: "short" }) })}</div>
              </div>
              <Button data-testid="continue" disabled={busy} onClick={() => void carryOn()}>
                {t("save.continueButton")}
              </Button>
            </Card>
          )}
          {(peek?.status === "invalid" || peek?.status === "newer") && (
            <Card className="border-warn/50! p-3 text-sm" data-testid="save-problem">
              <b className="text-warn">{t("save.problem")}</b>
              <p className="mt-1 text-xs text-muted">{peek.status === "newer" ? t("save.newer") : t("save.invalid")}</p>
            </Card>
          )}

          <section className="flex flex-col gap-2" aria-labelledby="story-h">
            <h2 id="story-h" className="font-display text-lg font-bold">
              {t("title.story")}
            </h2>
            {CHAPTERS.map((n) => {
              const open = n === 1;
              return (
                <Fragment key={n}>
                <div
                  className={`flex items-center gap-3 rounded-xl border bg-panel p-3 ${open ? "border-accent" : "border-line opacity-60"}`}
                >
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full font-display font-bold ${open ? "bg-accent text-accent-fg" : "bg-bg text-muted"}`}
                  >
                    {n}
                  </span>
                  <div className="min-w-0 flex-1 leading-tight">
                    <b className="block text-sm">{t(`chapters.${n}.name`)}</b>
                    <span className="text-xs text-muted">{t(`chapters.${n}.desc`)}</span>
                  </div>
                  {open ? (
                    <Button
                      className="px-3! py-2!"
                      data-testid="start-chapter-1"
                      disabled={busy}
                      onClick={() => (hasSave ? setConfirmNew(true) : void begin())}
                    >
                      {hasSave ? t("save.newGame") : t("title.start")}
                    </Button>
                  ) : (
                    <Pill>{t("title.locked")}</Pill>
                  )}
                </div>
                {n === 1 && confirmNew && (
              <Card className="flex flex-col gap-2 border-warn/50! p-3" role="alertdialog" aria-label={t("save.newGame")}>
                <p className="text-sm">{t("save.confirm")}</p>
                <div className="flex gap-2">
                  <Button variant="ghost" className="flex-1" onClick={() => setConfirmNew(false)}>
                    {t("save.cancel")}
                  </Button>
                  <Button variant="bad" className="flex-1" data-testid="confirm-new" disabled={busy} onClick={() => void begin()}>
                    {t("save.confirmYes")}
                  </Button>
                </div>
              </Card>
            )}
                </Fragment>
              );
            })}
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-line p-3 opacity-60">
              <span className="w-9 shrink-0">
                <Art id="laci-uang" />
              </span>
              <div className="flex-1 leading-tight">
                <b className="block text-sm">{t("title.freePlay")}</b>
                <span className="text-xs text-muted">{t("title.freePlayNote")}</span>
              </div>
              <Pill>{t("title.locked")}</Pill>
            </div>
          </section>

          <Card className="flex flex-col gap-3 p-3">
            <h2 className="font-display text-lg font-bold">{t("title.settings")}</h2>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>{t("title.language")}</span>
              <span className="flex gap-1.5">
                <Chip on={lang === "id"} onClick={() => setLang("id")}>Indonesia</Chip>
                <Chip on={lang === "en"} onClick={() => setLang("en")}>English</Chip>
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>{t("title.theme")}</span>
              <span className="flex gap-1.5">
                {THEMES.map((k) => (
                  <Chip key={k} on={theme === k} onClick={() => setTheme(k)}>
                    {t(`title.theme_${k}`)}
                  </Chip>
                ))}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>{t("title.input")}</span>
              <Pill tone="good">{t("title.inputNote")}</Pill>
            </div>
          </Card>
        </div>
      </div>
    </PhoneFrame>
  );
}
