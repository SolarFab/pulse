/**
 * Relative dates, resolved in code, in Berlin time.
 *
 * "Jazz tonight?" asked at 19:30 Berlin produced `p_date_from: 19:30:00Z` — the
 * Berlin wall-clock with a Z stuck on it, two hours in the future. Six of the
 * seven jazz events that night start 19:00–20:00 and fell outside the window;
 * the model honestly reported the one that was left. The prompt handed it a
 * local time string with no offset and asked it to write ISO. That is asking
 * nicely for something code should enforce.
 *
 * The model picks a word; this file turns the word into instants.
 */

export const WHEN = ["now", "tonight", "today", "tomorrow", "weekend", "week"] as const;
export type When = (typeof WHEN)[number];

const TZ = "Europe/Berlin";

/** Berlin wall-clock components of an instant. */
function berlinParts(d: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  );
  return {
    y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second,
    dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday),
  };
}

/** Offset (ms) of Berlin from UTC at a given instant — DST-aware. */
function berlinOffsetMs(d: Date): number {
  const b = berlinParts(d);
  const asUtc = Date.UTC(b.y, b.m - 1, b.d, b.h, b.min, b.s);
  return asUtc - Math.floor(d.getTime() / 1000) * 1000;
}

/**
 * The instant at a Berlin wall-clock time on the calendar day `dayOffset` days
 * from `now`'s Berlin date. Computes the offset AT the target, so a window that
 * crosses a DST switch lands on the right side of it.
 */
function berlinAt(now: Date, dayOffset: number, hour: number, minute = 0): Date {
  const b = berlinParts(now);
  const guess = new Date(Date.UTC(b.y, b.m - 1, b.d + dayOffset, hour, minute, 0));
  const off1 = berlinOffsetMs(guess);
  const t1 = new Date(guess.getTime() - off1);
  const off2 = berlinOffsetMs(t1);
  return off1 === off2 ? t1 : new Date(guess.getTime() - off2);
}

export type Window = { from: string; to: string };

/**
 * Resolve a relative word to an ISO window.
 *
 * Nights spill past midnight, so every "day" ends at 05:00 the next morning.
 * "tonight" starts at 17:00 rather than now: a 19:00 show asked about at 19:30
 * is still tonight's show, and the tool's 6-hour grace keeps it eligible.
 */
export function resolveWhen(when: When, now: Date = new Date()): Window {
  const b = berlinParts(now);
  switch (when) {
    case "now":
      return { from: new Date(now.getTime() - 6 * 3600_000).toISOString(),
               to: new Date(now.getTime() + 30 * 60_000).toISOString() };
    case "tonight":
      // Asked after 05:00: this evening. Asked at 02:00: the night still running.
      return b.h < 5
        ? { from: berlinAt(now, -1, 17).toISOString(), to: berlinAt(now, 0, 5).toISOString() }
        : { from: berlinAt(now, 0, 17).toISOString(), to: berlinAt(now, 1, 5).toISOString() };
    case "today":
      return { from: berlinAt(now, 0, 0).toISOString(), to: berlinAt(now, 1, 5).toISOString() };
    case "tomorrow":
      return { from: berlinAt(now, 1, 0).toISOString(), to: berlinAt(now, 2, 5).toISOString() };
    case "weekend": {
      // Fri 17:00 → Mon 05:00. On Sat/Sun that is the weekend under way.
      const toFri = b.dow >= 5 ? 5 - b.dow : b.dow === 0 ? -2 : 5 - b.dow;
      const fri = toFri;
      return { from: berlinAt(now, fri, 17).toISOString(), to: berlinAt(now, fri + 3, 5).toISOString() };
    }
    case "week":
      return { from: now.toISOString(), to: new Date(now.getTime() + 7 * 86400_000).toISOString() };
  }
}

/** The clock the prompt should show: ISO with the real offset, so an explicit
 *  date the model still has to write starts from something unambiguous. */
export function berlinClock(now: Date = new Date()): string {
  const off = berlinOffsetMs(now) / 60_000;
  const sign = off >= 0 ? "+" : "-";
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
  const mm = String(Math.abs(off) % 60).padStart(2, "0");
  const b = berlinParts(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${b.y}-${pad(b.m)}-${pad(b.d)}T${pad(b.h)}:${pad(b.min)}:${pad(b.s)}${sign}${hh}:${mm}`;
}
