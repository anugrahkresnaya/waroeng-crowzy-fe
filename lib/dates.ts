import { addDays, content } from "@/engine";

/** "13 Okt": a short date for the game day, in the chosen language. */
export function dayLabel(day: number, lang: string): string {
  const d = addDays(content.market.calendarStart, day);
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Labels for the last `count` days up to and including `today`, oldest first. */
export function recentLabels(today: number, count: number, lang: string): string[] {
  return Array.from({ length: count }, (_, i) => dayLabel(today - (count - 1 - i), lang));
}
