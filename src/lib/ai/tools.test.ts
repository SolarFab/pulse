import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { RPC_ROW } from "./match_events_v2.fixture";

// Schema-level tests (semantic-search 2.4): validation rules, no network/DB.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon";

const rpcMock = vi.fn();
// The config read is a table select, not an RPC — the schema tests never touch a
// database, so it resolves to "nothing calibrated", which is also the honest
// default: the ladder then runs unrelaxed rather than trusting a foreign floor.
// The config read is a table select, not an RPC. Default is "nothing calibrated",
// which is the honest default — the ladder then runs unrelaxed rather than
// trusting a floor calibrated for some other embedding model.
vi.mock("./anonClient", () => ({
  supabaseAnon: {
    rpc: (...a: unknown[]) => rpcMock(...a),
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    }),
  },
}));
const embedMock = vi.fn(async (_text: string) => "[0.1,0.2]");
vi.mock("./embedQuery", () => ({ embedQuery: (t: string) => embedMock(t) }));

let searchSchema: { safeParse: (v: unknown) => { success: boolean } };

beforeAll(async () => {
  const { buildTools } = await import("./tools");
  const tools = buildTools({
    categories: ["music", "nightlife", "markets"],
    subcategories: ["jazz-blues", "flea-market"],
    log: [],
  });
  searchSchema = tools.search_events.inputSchema as typeof searchSchema;
});

describe("search_events schema", () => {
  it("accepts an empty call (all params optional)", () => {
    expect(searchSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a full hybrid call", () => {
    expect(
      searchSchema.safeParse({
        query: "jazz",
        subcategory: "jazz-blues",
        date_from: "2026-07-30T17:00:00+02:00",
        date_to: "2026-07-31T05:00:00+02:00",
        family_friendly: true,
        lat: 52.474,
        lng: 13.428,
        radius_km: 1,
        limit: 10,
      }).success
    ).toBe(true);
  });

  it("rejects lat without lng (geo pair rule)", () => {
    expect(searchSchema.safeParse({ lat: 52.5 }).success).toBe(false);
  });

  it("rejects unknown category (enum generated from taxonomy)", () => {
    expect(searchSchema.safeParse({ category: "sportsball" }).success).toBe(false);
    expect(searchSchema.safeParse({ category: "markets" }).success).toBe(true);
  });

  it("rejects out-of-range radius and limit", () => {
    expect(searchSchema.safeParse({ lat: 52.5, lng: 13.4, radius_km: 50 }).success).toBe(false);
    expect(searchSchema.safeParse({ limit: 100 }).success).toBe(false);
  });

  it("rejects coordinates outside Berlin", () => {
    expect(searchSchema.safeParse({ lat: 48.13, lng: 11.58 }).success).toBe(false); // Munich
  });
});

// Sparse-taxonomy degrade (hip-hop incident): an empty filtered result with a
// text query retries once without category/subcategory instead of dead-ending.
/**
 * These replace the old "relax-on-empty" and "genre filter" suites, which pinned
 * the behaviour the phase 6 review required removing: inferred taxonomy applied
 * as a hard filter, and relaxation triggered by a zero row count. Both are the
 * defect, so their tests are the defect's specification and had to go with it.
 */
describe("search_events — retrieve wide, show narrow", () => {
  beforeEach(() => { rpcMock.mockReset(); embedMock.mockClear(); });

  const rowsOf = (n: number, o: Partial<Record<string, unknown>> = {}) =>
    Array.from({ length: n }, (_, i) => ({
      id: `e${i}`, title: `Event ${i}`, similarity: 0.9 - i / 100, area_resolved_by: null,
      distance_km: 8, price_qualifies: true, price_unknown: false, ...o,
    }));

  async function search(args: Record<string, unknown>, o: { utterance?: string } = {}) {
    const { buildTools } = await import("./tools");
    const log: unknown[] = [];
    const tools = buildTools({
      categories: ["music", "nightlife"], subcategories: ["comedy"], genres: ["hip-hop"],
      areas: [
        { area_id: "prenzlauer-berg", name: "Prenzlauer Berg", centroid_lat: 52.54, centroid_lng: 13.42 },
        { area_id: "neukoelln", name: "Neukölln", centroid_lat: 52.4787, centroid_lng: 13.4403 },
      ] as never,
      log: log as never,
      ...o,
    });
    const exec = (tools.search_events as unknown as {
      execute: (a: unknown, c?: unknown) => Promise<unknown>;
    }).execute;
    const out = await exec(args, {});
    return { out: out as Record<string, unknown>, log: log as Record<string, unknown>[] };
  }

  it("makes exactly one retrieval, broad, against match_events_v2", async () => {
    rpcMock.mockResolvedValue({ data: rowsOf(3), error: null });
    await search({ query: "comedy", area_id: "prenzlauer-berg" });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fn, a] = rpcMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe("match_events_v2");
    expect(a.p_limit).toBe(100);              // retrieval breadth, not the shown count
  });

  it("sends inferred taxonomy as ranking inputs, never as hard filters", async () => {
    rpcMock.mockResolvedValue({ data: rowsOf(3), error: null });
    await search({ query: "hip hop", subcategory: "comedy", genres: ["hip-hop"] });
    const a = rpcMock.mock.calls[0][1] as Record<string, unknown>;
    expect(a.p_rank_subcategory).toBe("comedy");
    expect(a.p_rank_genres).toEqual(["hip-hop"]);
    expect(a.p_filter_subcategory).toBeNull();
    expect(a.p_filter_category).toBeNull();
  });

  it("answers with the local ones and reports the rest — the Cosmic Comedy case", async () => {
    rpcMock.mockResolvedValue({
      data: [
        { ...rowsOf(1)[0], id: "tati", area_resolved_by: "postcode" },
        { ...rowsOf(1)[0], id: "cosmic", area_resolved_by: "district", distance_km: 1.3 },
        ...rowsOf(11).map((r, i) => ({ ...r, id: `x${i}` })),
      ],
      error: null,
    });
    const { out } = await search({ query: "comedy", area_id: "prenzlauer-berg" });
    const events = out.events as Array<{ id: string }>;
    expect(events.map((e) => e.id)).toEqual(["tati", "cosmic"]);      // both in the area
    expect(out.counts).toMatchObject({ in_area: 2, total: 13 });
    expect(out.note).toMatch(/2 in Prenzlauer Berg, 11 more across Berlin/);
    expect((out.offers as unknown[]).length).toBeGreaterThan(0);
  });

  it("shows `limit` events, never more, and never as retrieval", async () => {
    rpcMock.mockResolvedValue({ data: rowsOf(40), error: null });
    const { out } = await search({ query: "comedy", limit: 3 });
    expect((out.events as unknown[]).length).toBe(3);
    expect(out.counts).toMatchObject({ total: 40 });
    expect((rpcMock.mock.calls[0][1] as Record<string, unknown>).p_limit).toBe(100);
  });

  it("unknown price cannot be the answer under a stated limit, but is labelled", async () => {
    rpcMock.mockResolvedValue({
      data: [{ ...rowsOf(1)[0], id: "u", price_qualifies: false, price_unknown: true }],
      error: null,
    });
    const { out } = await search({ query: "comedy", max_price_cents: 1500 });
    expect(out.counts).toMatchObject({ total: 0 });
  });

  it("logs the counts a complaint needs", async () => {
    rpcMock.mockResolvedValue({ data: rowsOf(4), error: null });
    const { log } = await search({ query: "comedy" });
    expect(log[0].counts).toMatchObject({ total: 4 });
  });

  it("a relative word overrides a model-written window — the jazz-tonight bug", async () => {
    // Pinned to the night it happened: `when` resolves against the real clock,
    // so the unpinned version of this test only ever passed on 2026-09-10.
    vi.useFakeTimers({ now: new Date("2026-09-10T17:30:34Z"), toFake: ["Date"] });
    try {
      rpcMock.mockResolvedValue({ data: rowsOf(2), error: null });
      // The model wrote Berlin wall-clock with a Z: two hours in the future.
      await search({ query: "jazz", when: "tonight", date_from: "2026-09-10T19:30:00Z" });
      const a = rpcMock.mock.calls[0][1] as Record<string, unknown>;
      const from = Date.parse(a.p_date_from as string);
      // resolved "tonight" starts at 17:00 Berlin: strictly earlier than the bogus 19:30Z
      expect(from).toBeLessThan(Date.parse("2026-09-10T19:30:00Z"));
      expect(new Date(from).toISOString()).toBe("2026-09-10T15:00:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it("an area annotates: the RPC gets p_area_id, never the centroid as a geo filter", async () => {
    rpcMock.mockResolvedValue({ data: rowsOf(3), error: null });
    await search({ query: "comedy", area_id: "neukoelln" });
    const a = rpcMock.mock.calls[0][1] as Record<string, unknown>;
    expect(a.p_area_id).toBe("neukoelln");
    expect(a.p_lat).toBeNull(); // the centroid used to go here and switch on the 1.5 km cut
    expect(a.p_lng).toBeNull();
  });

  it("an explicit lat/lng/radius is still the model's geo filter", async () => {
    rpcMock.mockResolvedValue({ data: rowsOf(3), error: null });
    await search({ query: "Schillerkiez", lat: 52.474, lng: 13.428, radius_km: 1.2 });
    const a = rpcMock.mock.calls[0][1] as Record<string, unknown>;
    expect(a.p_lat).toBe(52.474);
    expect(a.p_radius_km).toBe(1.2);
  });

  it("no query from the model: the user's words are embedded — the KussKuss case", async () => {
    rpcMock.mockResolvedValue({ data: rowsOf(3), error: null });
    const { log } = await search(
      { subcategory: "comedy", when: "tonight", area_id: "neukoelln" },
      { utterance: "Comedy tonight in Neukölln?" }
    );
    expect(embedMock).toHaveBeenCalledWith("Comedy tonight in Neukölln?");
    const a = rpcMock.mock.calls[0][1] as Record<string, unknown>;
    expect(a.query_embedding).toBe("[0.1,0.2]");
    expect(log[0].query_from).toBe("utterance");
  });

  it("the model's own query still wins over the utterance", async () => {
    rpcMock.mockResolvedValue({ data: rowsOf(3), error: null });
    const { log } = await search({ query: "jazz konzert" }, { utterance: "Jazz heute Abend?" });
    expect(embedMock).toHaveBeenLastCalledWith("jazz konzert");
    expect(log[0].query_from).toBe("model");
  });

  it("a row shaped exactly like the live RPC's lands in the area", async () => {
    rpcMock.mockResolvedValue({ data: [RPC_ROW, ...rowsOf(2)], error: null });
    const { out } = await search({ query: "comedy", area_id: "neukoelln" });
    expect((out.events as Array<{ id: string }>).map((e) => e.id)).toEqual([RPC_ROW.id]);
    expect(out.counts).toMatchObject({ in_area: 1, total: 3 });
  });

  it("still reports a search failure instead of pretending it was empty", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { out } = await search({ query: "comedy" });
    expect(out.error).toBeTruthy();
  });
});

describe("recentAsk — what gets embedded when the model writes no query", () => {
  it("joins the last two user turns, newest first, skipping assistant turns", async () => {
    const { recentAsk } = await import("./tools");
    expect(recentAsk([
      { role: "user", content: "Jazz tonight?" }, { role: "assistant", content: "…" },
      { role: "user", content: "Comedy tonight ?" }, { role: "assistant", content: "…" },
      { role: "user", content: "And in Neukölln ?" },
    ])).toBe("And in Neukölln ? | Comedy tonight ?");
    expect(recentAsk([{ role: "user", content: "  " }])).toBe("");
    expect(recentAsk([])).toBe("");
  });
});
