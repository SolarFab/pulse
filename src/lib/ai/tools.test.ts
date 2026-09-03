import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
const configMock = { current: null as Record<string, unknown> | null };
vi.mock("./anonClient", () => ({
  supabaseAnon: {
    rpc: (...a: unknown[]) => rpcMock(...a),
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: configMock.current, error: null }) }),
      }),
    }),
  },
}));
vi.mock("./embedQuery", () => ({ embedQuery: async () => "[0.1,0.2]" }));

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
describe("search_events — staged retrieval", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    configMock.current = null;
    delete process.env.EMBED_MODEL;
  });

  const rowsOf = (n: number, sim = 0.9) =>
    Array.from({ length: n }, (_, i) => ({
      id: `e${i}`, title: `Event ${i}`, similarity: sim,
      price_qualifies: true, price_unknown: false, area_resolved_by: "postcode",
    }));

  async function search(args: Record<string, unknown>) {
    const { buildTools } = await import("./tools");
    const log: unknown[] = [];
    const tools = buildTools({
      categories: ["music", "nightlife"], subcategories: ["comedy"],
      genres: ["hip-hop"], areas: ["prenzlauer-berg", "neukoelln"],
      log: log as never,
    });
    const exec = (tools.search_events as unknown as {
      execute: (a: unknown, c?: unknown) => Promise<unknown>;
    }).execute;
    const out = await exec(args, {});
    return { out: out as Record<string, unknown>, log: log as Record<string, unknown>[] };
  }

  it("calls match_events_v2, never the v1 function", async () => {
    rpcMock.mockResolvedValue({ data: rowsOf(3), error: null });
    await search({ query: "comedy" });
    expect(rpcMock.mock.calls[0][0]).toBe("match_events_v2");
  });

  it("sends inferred taxonomy as ranking inputs, never as hard filters", async () => {
    rpcMock.mockResolvedValue({ data: rowsOf(3), error: null });
    await search({ query: "hip hop", subcategory: "comedy", genres: ["hip-hop"] });
    const a = rpcMock.mock.calls[0][1] as Record<string, unknown>;
    expect(a.p_rank_subcategory).toBe("comedy");
    expect(a.p_rank_genres).toEqual(["hip-hop"]);
    // the gate that hid 45 of 97 comedy events must not be set from an inference
    expect(a.p_filter_subcategory).toBeNull();
    expect(a.p_filter_category).toBeNull();
  });

  it("passes a canonical area id, so no raw location string reaches SQL", async () => {
    rpcMock.mockResolvedValue({ data: rowsOf(3), error: null });
    await search({ query: "comedy", area_id: "prenzlauer-berg" });
    expect((rpcMock.mock.calls[0][1] as Record<string, unknown>).p_area_id).toBe("prenzlauer-berg");
  });

  it("reports the routing evidence a complaint needs", async () => {
    rpcMock.mockResolvedValue({ data: rowsOf(3), error: null });
    const { log } = await search({ query: "comedy", area_id: "neukoelln" });
    expect(log[0]).toMatchObject({
      unrelaxed_count: 3, location_source: "postcode", config_state: "no_active_config",
    });
    expect(Array.isArray(log[0].attempts)).toBe(true);
  });

  it("surfaces the widening to the model rather than letting it guess", async () => {
    // Needs a calibrated floor: uncalibrated correctly refuses to relax at all.
    // The model is pinned on BOTH sides rather than read from the environment —
    // EMBED_MODEL is set locally and empty in CI, so reading it made this test
    // pass here and fail there, which is the environment-dependence the config
    // check exists to catch.
    process.env.EMBED_MODEL = "test-embed-model";
    configMock.current = {
      floor: 0.5, k: 3,
      embedding_model: "test-embed-model", embedding_dim: 1536,
    };
    rpcMock
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValue({ data: rowsOf(3), error: null });
    const { out } = await search({ query: "comedy", area_id: "prenzlauer-berg" });
    expect(out.meta).toMatchObject({ widened: ["area"] });
  });

  it("labels an unknown price so the answer cannot assert it is in budget", async () => {
    rpcMock.mockResolvedValue({
      data: [{ id: "e1", title: "T", similarity: 0.9, price_qualifies: false, price_unknown: true }],
      error: null,
    });
    const { out } = await search({ query: "comedy", max_price_cents: 1500 });
    const events = out.events as Array<Record<string, unknown>>;
    expect(events[0].price_note).toMatch(/do not state it as within a budget/);
  });

  it("says the floor is uncalibrated rather than inventing one", async () => {
    rpcMock.mockResolvedValue({ data: rowsOf(1), error: null });
    const { out } = await search({ query: "comedy" });
    expect(out.note).toMatch(/uncalibrated/);
  });

  it("still reports a search failure instead of pretending it was empty", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { out } = await search({ query: "comedy" });
    expect(out.error).toBeTruthy();
  });
});
