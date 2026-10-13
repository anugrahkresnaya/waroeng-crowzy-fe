"use client";

import { useTranslation } from "react-i18next";

/** Picks the Indonesian or English text from a content entry, following the language switch. */
export function useLocalize() {
  const { i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "id";
  return (text: { id: string; en: string }) => text[lang];
}
