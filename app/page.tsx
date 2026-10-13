"use client";

import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Art } from "@/components/art";
import { PhoneFrame } from "@/components/phone-frame";
import { Button, Card, Chip, Pill } from "@/components/ui";
import { useGame } from "@/lib/game-store";
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

          <section className="flex flex-col gap-2" aria-labelledby="story-h">
            <h2 id="story-h" className="font-display text-lg font-bold">
              {t("title.story")}
            </h2>
            {CHAPTERS.map((n) => {
              const open = n === 1;
              return (
                <div
                  key={n}
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
                      onClick={() => {
                        start();
                        router.push("/beranda");
                      }}
                    >
                      {t("title.start")}
                    </Button>
                  ) : (
                    <Pill>{t("title.locked")}</Pill>
                  )}
                </div>
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
