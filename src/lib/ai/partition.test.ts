import { describe, expect, it } from "vitest";
import { NEARBY_KM, partition, present, priceEligible, type Row } from "./partition";

const row = (id: string, o: Partial<Row> = {}): Row => ({
  id,
  similarity: 0.5,
  loc_src: null,
  distance_km: null,
  price_qualifies: true,
  price_unknown: false,
  ...o,
});

describe("partition", () => {
  it("puts every area tier in the area, whatever its strength", () => {
    // The winner-take-all tier bug: a label match used to be DROPPED when any
    // postcode match existed. Cosmic Comedy is label + district, not postcode.
    const g = partition(
      [
        row("plz", { loc_src: "postcode" }),
        row("dist", { loc_src: "district" }),
        row("lbl", { loc_src: "neighborhood_label" }),
        row("far", { loc_src: null, distance_km: 9 }),
      ],
      { areaAsked: true }
    );
    expect(g.inArea.map((r) => r.id)).toEqual(["plz", "dist", "lbl"]);
    expect(g.elsewhere.map((r) => r.id)).toEqual(["far"]);
  });

  it("treats close-but-outside as nearby, not elsewhere", () => {
    const g = partition(
      [row("r", { loc_src: "centroid_radius" }), row("d", { distance_km: NEARBY_KM - 0.5 })],
      { areaAsked: true }
    );
    expect(g.nearby.map((r) => r.id)).toEqual(["r", "d"]);
  });

  it("preserves the RPC's ranking inside each group", () => {
    const g = partition(
      [row("a", { loc_src: "postcode" }), row("b", { loc_src: "postcode" })],
      { areaAsked: true }
    );
    expect(g.inArea.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("with no area asked, nothing is partitioned", () => {
    const g = partition([row("a"), row("b")], { areaAsked: false });
    expect(g.inArea).toEqual([]);
    expect(g.elsewhere).toHaveLength(2);
  });
});

describe("price eligibility", () => {
  it("unknown price cannot satisfy a stated limit", () => {
    const rows = [row("k"), row("u", { price_qualifies: false, price_unknown: true })];
    expect(priceEligible(rows, true).map((r) => r.id)).toEqual(["k"]);
    expect(priceEligible(rows, false)).toHaveLength(2);
  });
});

describe("present", () => {
  const groups = {
    inArea: [row("tati", { loc_src: "postcode" })],
    nearby: [row("cosmic", { loc_src: "district", distance_km: 1.3 }), row("n2", { distance_km: 2 })],
    elsewhere: Array.from({ length: 10 }, (_, i) => row(`e${i}`, { distance_km: 8 })),
  };

  it("answers with the local ones and reports what exists beyond — the ask", () => {
    const p = present(groups, { areaAsked: true, areaName: "Prenzlauer Berg", show: 5 });
    expect(p.events.map((r) => r.id)).toEqual(["tati"]);
    expect(p.counts).toEqual({ in_area: 1, nearby: 2, elsewhere: 10, total: 13 });
    expect(p.note).toMatch(/1 in Prenzlauer Berg, 12 more across Berlin/);
    expect(p.offers.map((r) => r.id)).toEqual(["cosmic", "n2", "e0"]);
  });

  it("nothing local: says so first, then offers the nearest", () => {
    const p = present({ ...groups, inArea: [] }, { areaAsked: true, areaName: "Spandau", show: 5 });
    expect(p.events).toEqual([]);
    expect(p.note).toMatch(/nothing in Spandau; 12 exist elsewhere/);
    expect(p.offers[0].id).toBe("cosmic");
  });

  it("nothing anywhere is a plain answer, not an invitation to invent", () => {
    const p = present({ inArea: [], nearby: [], elsewhere: [] }, { areaAsked: true, areaName: "Mitte", show: 5 });
    expect(p.note).toMatch(/nothing matched in Mitte or anywhere else/);
    expect(p.offers).toEqual([]);
  });

  it("everything local: no note needed", () => {
    const p = present({ inArea: [row("a"), row("b")], nearby: [], elsewhere: [] }, { areaAsked: true, show: 5 });
    expect(p.note).toBeNull();
  });

  it("no area: shows `show` of the total and says how many more", () => {
    const p = present(
      { inArea: [], nearby: [], elsewhere: Array.from({ length: 13 }, (_, i) => row(`x${i}`)) },
      { areaAsked: false, show: 5 }
    );
    expect(p.events).toHaveLength(5);
    expect(p.note).toMatch(/showing 5 of 13/);
  });

  it("show is presentation, not retrieval — never inflates the answer", () => {
    const p = present(groups, { areaAsked: true, show: 20 });
    expect(p.events).toHaveLength(1);
  });
});
