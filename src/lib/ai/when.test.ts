import { describe, expect, it } from "vitest";
import { berlinClock, resolveWhen } from "./when";

// Thursday 10 Sep 2026, 19:30:34 Berlin (CEST, UTC+2) — the "Jazz tonight?" ask.
const ASK = new Date("2026-09-10T17:30:34Z");

describe("tonight", () => {
  it("starts at 17:00 Berlin, not at the moment of asking — the jazz bug", () => {
    // The model wrote 19:30:00Z: Berlin wall-clock with a Z, two hours late.
    // Six of seven jazz events start 19:00–20:00 Berlin and were excluded.
    const w = resolveWhen("tonight", ASK);
    expect(w.from).toBe("2026-09-10T15:00:00.000Z"); // 17:00 CEST
    expect(w.to).toBe("2026-09-11T03:00:00.000Z");   // 05:00 CEST next day
  });

  it("includes every jazz event that night", () => {
    const w = resolveWhen("tonight", ASK);
    const starts = ["17:00", "17:30", "18:00", "18:00", "18:00", "21:59"].map(
      (t) => `2026-09-10T${t}:00Z`
    );
    for (const s of starts) expect(s >= w.from && s <= w.to).toBe(true);
  });

  it("asked at 02:00 means the night still running, not the next one", () => {
    const w = resolveWhen("tonight", new Date("2026-09-11T00:00:00Z")); // 02:00 CEST Fri
    expect(w.from).toBe("2026-09-10T15:00:00.000Z");
    expect(w.to).toBe("2026-09-11T03:00:00.000Z");
  });
});

describe("other words", () => {
  it("today runs from midnight and spills to 05:00", () => {
    const w = resolveWhen("today", ASK);
    expect(w.from).toBe("2026-09-09T22:00:00.000Z");
    expect(w.to).toBe("2026-09-11T03:00:00.000Z");
  });

  it("tomorrow is the next Berlin calendar day", () => {
    const w = resolveWhen("tomorrow", ASK);
    expect(w.from).toBe("2026-09-10T22:00:00.000Z");
    expect(w.to).toBe("2026-09-12T03:00:00.000Z");
  });

  it("weekend from a Thursday is Fri 17:00 to Mon 05:00", () => {
    const w = resolveWhen("weekend", ASK);
    expect(w.from).toBe("2026-09-11T15:00:00.000Z"); // Fri 17:00 CEST
    expect(w.to).toBe("2026-09-14T03:00:00.000Z");   // Mon 05:00 CEST
  });

  it("weekend from a Sunday is the one under way", () => {
    const w = resolveWhen("weekend", new Date("2026-09-13T10:00:00Z")); // Sun 12:00
    expect(w.from).toBe("2026-09-11T15:00:00.000Z");
  });

  it("now is started-or-imminent", () => {
    const w = resolveWhen("now", ASK);
    expect(w.from).toBe("2026-09-10T11:30:34.000Z"); // −6 h grace
    expect(w.to).toBe("2026-09-10T18:00:34.000Z");   // +30 min
  });
});

describe("DST", () => {
  it("crossing the October switch computes the offset at the target, not at now", () => {
    // Sat 24 Oct 2026 20:00 CEST asks "tomorrow"; Sun 25 Oct switches to CET.
    const w = resolveWhen("tomorrow", new Date("2026-10-24T18:00:00Z"));
    expect(w.from).toBe("2026-10-24T22:00:00.000Z"); // Sun 00:00 is still CEST
    expect(w.to).toBe("2026-10-26T04:00:00.000Z");   // Mon 05:00 is CET (+1)
  });
});

describe("the clock the prompt shows", () => {
  it("carries the real offset so nothing has to guess it", () => {
    expect(berlinClock(ASK)).toBe("2026-09-10T19:30:34+02:00");
  });
  it("switches to +01:00 in winter", () => {
    expect(berlinClock(new Date("2026-12-10T12:00:00Z"))).toBe("2026-12-10T13:00:00+01:00");
  });
});
