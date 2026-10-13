import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";
import id from "@/locales/id.json";

export type Lang = "id" | "en";

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: { id: { translation: id }, en: { translation: en } },
    lng: "id",
    fallbackLng: "id",
    interpolation: { escapeValue: false },
    initAsync: false,
    react: { useSuspense: false },
  });
}

export default i18n;
