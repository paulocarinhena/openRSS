export function formatDay(day: string, locale: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

export function formatShortDay(date: Date, locale: string, timeZone: string) {
  return date.toLocaleDateString(locale, { day: "numeric", month: "short", timeZone });
}

export function formatTime(date: Date, locale: string, timeZone: string) {
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone });
}
