import { create } from "zustand";
import i18n, { type Lang } from "@/lib/i18n";

export type Theme = "auto" | "light" | "dark";

interface SettingsStore {
  lang: Lang;
  theme: Theme;
  hydrated: boolean;
  hydrate: () => void;
  setLang: (lang: Lang) => void;
  setTheme: (theme: Theme) => void;
}

const KEY = "warung.settings";

function save(lang: Lang, theme: Theme) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ lang, theme }));
  } catch {
    /* private mode: the settings just do not persist */
  }
}

function applyTheme(theme: Theme) {
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  lang: "id",
  theme: "auto",
  hydrated: false,
  hydrate: () => {
    let lang: Lang = "id";
    let theme: Theme = "auto";
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<{ lang: Lang; theme: Theme }>;
        if (saved.lang === "id" || saved.lang === "en") lang = saved.lang;
        if (saved.theme === "auto" || saved.theme === "light" || saved.theme === "dark") theme = saved.theme;
      }
    } catch {
      /* ignore a corrupt value */
    }
    void i18n.changeLanguage(lang);
    applyTheme(theme);
    set({ lang, theme, hydrated: true });
  },
  setLang: (lang) => {
    void i18n.changeLanguage(lang);
    set({ lang });
    save(lang, get().theme);
  },
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
    save(get().lang, theme);
  },
}));
