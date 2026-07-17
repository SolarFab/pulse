/**
 * Regression tests for the all-day/time display helpers.
 *
 * Background: all-day events are stored as Berlin midnight. Older pipeline
 * data used a hardcoded +01:00 (CET) offset year-round, so in summer (CEST)
 * those timestamps are 23:00 UTC and rendered as "01:00" in the app. These
 * tests pin both the correct-data path and the legacy-bug detection.
 */
import { describe, expect, test } from "vitest";
import { formatEventTime, isAllDayEvent } from "./types";

const ev = (start_time: string, category = "culture", end_time: string | null = null) => ({
  start_time,
  end_time,
  category,
});

describe("isAllDayEvent", () => {
  test("summer Berlin midnight (correctly stored) is all-day", () => {
    // 2026-07-15 00:00 Berlin (CEST) = 22:00 UTC the day before
    expect(isAllDayEvent(ev("2026-07-14T22:00:00Z"))).toBe(true);
  });

  test("winter Berlin midnight is all-day", () => {
    // 2026-01-15 00:00 Berlin (CET) = 23:00 UTC the day before
    expect(isAllDayEvent(ev("2026-01-14T23:00:00Z"))).toBe(true);
  });

  test("legacy bug signature (00:00+01:00 stored during CEST) is all-day", () => {
    // renders as 01:00 Berlin — the old pipeline's hardcoded-CET bug
    expect(isAllDayEvent(ev("2026-07-08T23:00:00Z"))).toBe(true);
  });

  test("nightlife at 01:00 is NOT all-day (real club start times exist)", () => {
    expect(isAllDayEvent(ev("2026-07-08T23:00:00Z", "nightlife"))).toBe(false);
  });

  test("ordinary evening event is not all-day", () => {
    // 20:00 Berlin in summer
    expect(isAllDayEvent(ev("2026-07-15T18:00:00Z"))).toBe(false);
  });

  test("event at 23:00 Berlin is not all-day", () => {
    // 23:00 Berlin CEST = 21:00 UTC — must not trip the UTC-23h heuristic
    expect(isAllDayEvent(ev("2026-07-15T21:00:00Z"))).toBe(false);
  });
});

describe("formatEventTime", () => {
  test("all-day events say so instead of showing a midnight time", () => {
    expect(formatEventTime(ev("2026-07-14T22:00:00Z"))).toBe("All day");
  });

  test("timed events show Berlin wall-clock time", () => {
    // 18:00Z = 20:00 Berlin in summer
    expect(formatEventTime(ev("2026-07-15T18:00:00Z"))).toBe("20:00");
  });

  test("end time is appended when present", () => {
    expect(formatEventTime(ev("2026-07-15T18:00:00Z", "music", "2026-07-15T21:00:00Z"))).toBe(
      "20:00 – 23:00"
    );
  });

  test("times render in Berlin timezone regardless of host timezone", () => {
    // 2026-01-15 19:00Z = 20:00 Berlin (CET)
    expect(formatEventTime(ev("2026-01-15T19:00:00Z"))).toBe("20:00");
  });
});
