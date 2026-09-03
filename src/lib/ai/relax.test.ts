import { describe as group, expect, it } from "vitest";
import { dedupe, describe, ladder, sufficiency, type Row } from "./relax";

const row = (o: Partial<Row> & { id: string }): Row => ({
  similarity: 0.9,
  price_qualifies: true,
  price_unknown: false,
  ...o,
});
const cfg = { floor: 0.5, k: 3, embedding_model: "m", embedding_dim: 1536 };
const withVec = { hasEmbedding: true, priceLimitStated: false };

group("the ladder", () => {
  it("relaxes location, never meaning", () => {
    const steps = ladder({ query: "comedy", area_id: "prenzlauer-berg", venue: "Tati" });
    expect(steps.map((s) => s.relaxed)).toEqual([null, "venue", "area"]);
    // the query survives every rung — widening location must not change the question
    expect(steps.every((s) => s.args.query === "comedy")).toBe(true);
  });

  it("never relaxes a hard constraint", () => {
    const base = {
      query: "comedy",
      area_id: "neukoelln",
      date_from: "2026-09-03T18:00:00Z",
      date_to: "2026-09-04T04:00:00Z",
      max_price_cents: 1500,
      filter_category: "workshops",
    };
    for (const step of ladder(base)) {
      expect(step.args.date_from).toBe(base.date_from);
      expect(step.args.date_to).toBe(base.date_to);
      expect(step.args.max_price_cents).toBe(1500);
      expect(step.args.filter_category).toBe("workshops");
    }
  });

  it("produces no rung for a constraint the user never set", () => {
    // relaxing an absent venue is a wasted round-trip, and the trace would claim
    // a widening that never narrowed anything
    expect(ladder({ query: "comedy" }).map((s) => s.relaxed)).toEqual([null]);
  });

  it("turns an area into a radius when a centroid is known", () => {
    const steps = ladder({ area_id: "mitte", lat: 52.52, lng: 13.4 });
    const areaRung = steps.find((s) => s.relaxed === "area")!;
    expect(areaRung.args.area_id).toBeNull();
    expect(areaRung.args.radius_km).toBeGreaterThan(0);
    expect(steps.at(-1)!.relaxed).toBe("radius");
    expect(steps.at(-1)!.args.lat).toBeNull();
  });

  it("is deterministic", () => {
    const a = ladder({ query: "x", venue: "v", area_id: "a" });
    const b = ladder({ query: "x", venue: "v", area_id: "a" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

group("sufficiency", () => {
  it("does not stop on weak results — the 3 September bug", () => {
    // three rows, all below the floor. Row count says 3; quality says keep going.
    const weak = [row({ id: "a", similarity: 0.2 }), row({ id: "b", similarity: 0.1 }), row({ id: "c", similarity: 0.3 })];
    const s = sufficiency(weak, cfg, withVec);
    expect(s.ok).toBe(false);
    expect(s.reason).toBe("below_floor");
  });

  it("stops when k results clear the floor", () => {
    const good = ["a", "b", "c"].map((id) => row({ id, similarity: 0.8 }));
    expect(sufficiency(good, cfg, withVec)).toMatchObject({ ok: true, reason: "sufficient" });
  });

  it("counts duplicates once — three Tati Comedy copies are one event", () => {
    const copies = [
      row({ id: "1", dedup_key: "tati" }),
      row({ id: "2", dedup_key: "tati" }),
      row({ id: "3", dedup_key: "tati" }),
    ];
    const s = sufficiency(copies, cfg, withVec);
    expect(s.qualifying).toHaveLength(1);
    expect(s.ok).toBe(false);
  });

  it("never lets a null similarity satisfy the floor", () => {
    const unscored = ["a", "b", "c"].map((id) => row({ id, similarity: null }));
    expect(sufficiency(unscored, cfg, withVec).ok).toBe(false);
  });

  it("degrades to a count when there is no embedding, and says so", () => {
    const unscored = ["a", "b", "c"].map((id) => row({ id, similarity: null }));
    const s = sufficiency(unscored, cfg, { hasEmbedding: false, priceLimitStated: false });
    expect(s).toMatchObject({ ok: true, reason: "threshold_not_applicable" });
  });

  it("excludes unknown-price rows when the user named a price", () => {
    const rows = ["a", "b", "c"].map((id) =>
      row({ id, price_qualifies: false, price_unknown: true })
    );
    const s = sufficiency(rows, cfg, { hasEmbedding: true, priceLimitStated: true });
    expect(s.qualifying).toHaveLength(0);
    expect(s.ok).toBe(false);
  });

  it("keeps unknown-price rows when no price was named", () => {
    const rows = ["a", "b", "c"].map((id) =>
      row({ id, price_qualifies: true, price_unknown: true })
    );
    expect(sufficiency(rows, cfg, withVec).ok).toBe(true);
  });

  it("fails closed with no calibrated floor", () => {
    const s = sufficiency([row({ id: "a" })], null, withVec);
    expect(s.reason).toBe("uncalibrated");
    expect(s.ok).toBe(true); // stop, do not relax against a floor we do not have
  });
});

group("dedupe", () => {
  it("falls back to id when no dedup key exists yet", () => {
    // FEAT-23 owns the key; until then dedupe must be a no-op, never a data loss
    expect(dedupe([row({ id: "a" }), row({ id: "b" })])).toHaveLength(2);
  });
});

group("what the model is told", () => {
  it("labels a widened result as widened", () => {
    const note = describe({ index: 1, relaxed: "area", args: {} }, sufficiency([], cfg, withVec), false);
    expect(note).toMatch(/widened/);
  });

  it("says nothing when nothing was relaxed", () => {
    const good = ["a", "b", "c"].map((id) => row({ id }));
    expect(describe({ index: 0, relaxed: null, args: {} }, sufficiency(good, cfg, withVec), false)).toBeNull();
  });

  it("tells the truth when the city is empty", () => {
    const note = describe({ index: 3, relaxed: "radius", args: {} }, sufficiency([], cfg, withVec), true);
    expect(note).toMatch(/nothing matched anywhere/);
  });

  it("admits a thin result rather than padding it", () => {
    const one = [row({ id: "a", similarity: 0.9 })];
    const note = describe({ index: 3, relaxed: "radius", args: {} }, sufficiency(one, cfg, withVec), true);
    expect(note).toMatch(/fewer than usual/);
  });
});
