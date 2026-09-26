/**
 * When the courier is coming, in the words she would use.
 *
 * Shiprocket answers in Indian time and the console is read in India, but a
 * phone's clock can be anywhere; every date here is formatted in Asia/Kolkata
 * so "Tue 29 Sep" is the day the van actually comes.
 */
const TZ = "Asia/Kolkata";

export function pickupDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
}

/** "11:00", or null when only a day was given (a hand-entered booking). */
export function pickupTime(iso: string): string | null {
  const t = new Date(iso).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
  return t === "00:00" ? null : t;
}

/** "today", "tomorrow", or the day - the word she scans the list for. */
export function pickupWhen(iso: string, now: Date = new Date()): string {
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
  const tomorrow = new Date(now.getTime() + 86_400_000);
  if (day(new Date(iso)) === day(now)) return "today";
  if (day(new Date(iso)) === day(tomorrow)) return "tomorrow";
  return pickupDay(iso);
}
