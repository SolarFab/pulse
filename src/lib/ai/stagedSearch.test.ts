import { describe, expect, it, vi } from "vitest";
import { runStaged, type RpcRow } from "./stagedSearch";

const cfg = { floor: 0.5, k: 3, embedding_model: "m", embedding_dim: 1536 };
const hit = (id: string, sim = 0.9, extra: Partial<RpcRow> = {}): RpcRow =>
  ({ id, similarity: sim, price_qualifies: true, price_unknown: false, ...extra }) as RpcRow;

const run = (queue: RpcRow[][], base = {}, over = {}) => {
  const calls: Record<string, unknown>[] = [];
  const rpc = vi.fn(async (_fn: string, args: Record<string, unknown>) => {
    calls.push(args);
    return { data: queue.shift() ?? [], error: null };
  });
  return {
    calls,
    rpc,
    result: runStaged({
      rpc, base: { query: "comedy", ...base }, config: cfg,
      rank: { subcategory: "comedy" }, queryVector: "[0.1]", queryText: "comedy",
      limit: 10, ...over,
    }),
  };
};

describe("the staged search", () => {
  it("calls match_events_v2, not the old function", async () => {
    const { rpc } = run([[hit("a"), hit("b"), hit("c")]]);
    await rpc.mock.calls; // ensure invoked
    const { rpc: rpc2 } = run([[hit("a"), hit("b"), hit("c")]]);
    const r = await runStaged({
      rpc: rpc2, base: { query: "comedy" }, config: cfg, rank: {},
      queryVector: "[0.1]", queryText: "comedy", limit: 10,
    });
    expect(rpc2).toHaveBeenCalledWith("match_events_v2", expect.anything());
    expect(r.error).toBeNull();
  });

  it("passes inferred taxonomy as RANKING inputs, never as filters", async () => {
    const { calls, result } = run([[hit("a"), hit("b"), hit("c")]]);
    await result;
    expect(calls[0].p_rank_subcategory).toBe("comedy");
    expect(calls[0].p_filter_subcategory).toBeNull();
    expect(calls[0].p_filter_category).toBeNull();
  });

  it("does not relax when the first rung is good enough", async () => {
    const { calls, result } = run([[hit("a"), hit("b"), hit("c")]], { area_id: "prenzlauer-berg" });
    const r = await result;
    expect(calls).toHaveLength(1);
    expect(r.relaxed).toEqual([]);
    expect(r.note).toBeNull();
  });

  it("relaxes on weak results — the 3 September bug", async () => {
    // three rows below the floor: the old code stopped here because 3 !== 0
    const weak = [hit("a", 0.1), hit("b", 0.2), hit("c", 0.15)];
    const strong = [hit("x"), hit("y"), hit("z")];
    const { calls, result } = run([weak, strong], { area_id: "prenzlauer-berg" });
    const r = await result;
    expect(calls).toHaveLength(2);
    expect(calls[0].p_area_id).toBe("prenzlauer-berg");
    expect(calls[1].p_area_id).toBeNull();          // location widened
    expect(calls[1].p_query_text).toBe("comedy");   // meaning kept
    expect(r.relaxed).toContain("area");
    expect(r.note).toMatch(/widened/);
  });

  it("reports what the unrelaxed query found, so 'nothing there' is distinguishable", async () => {
    const { result } = run([[], [hit("x"), hit("y"), hit("z")]], { area_id: "neukoelln" });
    const r = await result;
    expect(r.unrelaxed_count).toBe(0);
    expect(r.attempts[0]).toMatchObject({ rung: 0, returned: 0 });
  });

  it("records the location tier the RPC answered with", async () => {
    const { result } = run([[hit("a", 0.9, { area_resolved_by: "postcode" }), hit("b"), hit("c")]],
      { area_id: "prenzlauer-berg" });
    const r = await result;
    expect(r.attempts[0].location_source).toBe("postcode");
  });

  it("answers honestly when the whole city is empty", async () => {
    const { result } = run([[], [], []], { area_id: "mitte", venue: "Tati" });
    const r = await result;
    expect(r.rows).toHaveLength(0);
    expect(r.note).toMatch(/nothing matched anywhere/);
  });

  it("keeps the best set rather than the last, widest one", async () => {
    const some = [hit("a"), hit("b")];   // 2 — below k, but real
    const { result } = run([some, []], { area_id: "mitte" });
    const r = await result;
    expect(r.rows.map((x) => x.id)).toEqual(["a", "b"]);
    expect(r.note).toMatch(/fewer than usual/);
  });

  it("compares qualifying counts rather than raw row counts", async () => {
    const weak = Array.from({ length: 10 }, (_, i) => hit(`weak-${i}`, 0.1));
    const strong = [hit("a"), hit("b")];
    const { result } = run([weak, strong], { area_id: "mitte" });
    const r = await result;
    expect(r.rows.map((x) => x.id)).toEqual(["a", "b"]);
    expect(r.relaxed).toEqual(["area"]);
  });

  it("never relaxes a hard constraint across the whole ladder", async () => {
    const { calls, result } = run([[], [], []], {
      area_id: "mitte", venue: "Tati",
      date_from: "2026-09-03T18:00:00Z", max_price_cents: 1500,
      family_friendly: true, outdoor: true, free_entry: true, neighborhood: "Kollwitzkiez",
    });
    await result;
    for (const c of calls) {
      expect(c.p_date_from).toBe("2026-09-03T18:00:00Z");
      expect(c.p_max_price_cents).toBe(1500);
      expect(c.p_family).toBe(true);
      expect(c.p_outdoor).toBe(true);
      expect(c.p_free).toBe(true);
      expect(c.p_neighborhood).toBe("Kollwitzkiez");
    }
  });

  it("stops without relaxing when no floor is calibrated", async () => {
    const { calls, result } = run([[hit("a", 0.01)]], { area_id: "mitte" }, { config: null });
    const r = await result;
    expect(calls).toHaveLength(1);
    expect(r.note).toMatch(/uncalibrated/);
  });

  it("surfaces an RPC error instead of silently relaxing past it", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "boom" } }));
    const r = await runStaged({
      rpc, base: { query: "comedy", area_id: "mitte" }, config: cfg, rank: {},
      queryVector: "[0.1]", queryText: "comedy", limit: 10,
    });
    expect(r.error).toBeTruthy();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("traces every attempt, not only the last", async () => {
    const seen: string[] = [];
    const weak = [hit("a", 0.1)];
    await runStaged({
      rpc: async () => ({ data: weak, error: null }),
      base: { query: "comedy", area_id: "mitte", venue: "Tati" },
      config: cfg, rank: {}, queryVector: "[0.1]", queryText: "comedy", limit: 10,
      observe: async (name, _input, fn) => { seen.push(name); return fn(); },
    });
    expect(seen).toEqual(["match-events", "match-events-relaxed", "match-events-relaxed"]);
  });

  it("records auditable retrieval evidence", async () => {
    const { result } = run([[hit("a"), hit("b"), hit("c")]]);
    const attempt = (await result).attempts[0];
    expect(attempt.results[0]).toEqual({ id: "a", similarity: 0.9 });
    expect(attempt.embedding_model).toBe("m");
    expect(attempt.embedding_dim).toBe(1536);
    expect(attempt.constraints).toBeTruthy();
    expect(attempt.catalogue_observed_at).toBeTruthy();
  });
});
