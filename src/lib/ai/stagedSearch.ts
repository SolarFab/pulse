/**
 * Runs the relaxation ladder against match_events_v2 (FEAT-25, findings 1 and 3).
 *
 * The RPC call is injected, so the whole orchestration — which rung fired, when
 * it stopped, what the model is told — is testable without a database. That
 * matters more than usual here: the bug this replaces was invisible precisely
 * because nobody could see the decision, only the row count.
 */
import { dedupe, describe as describeOutcome, ladder, sufficiency, type Rung, type FloorConfig, type Row, type SearchArgs } from "./relax";

export type RpcRow = Row & Record<string, unknown>;
export const WIDER_HINT_BELOW = 5;

export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: RpcRow[] | null; error: unknown }>;

export type Attempt = {
  rung: number;
  relaxed: string | null;
  /** Which location tier answered, straight from the RPC. */
  location_source: string | null;
  returned: number;
  qualifying: number;
  reason: string;
  constraints: Record<string, unknown>;
  results: Array<{ id: string; similarity: number | null }>;
  embedding_model: string | null;
  embedding_dim: number | null;
  catalogue_observed_at: string;
};

/** What exists beyond the constraint the user set, when they set one.
 *
 *  Answering "one in Prenzlauer Berg" without saying "twelve in Berlin tonight"
 *  is technically true and practically useless: the asker cannot tell whether
 *  the night is quiet or their question was narrow. The ladder already knows how
 *  to widen, so one extra call turns a dead end into a choice. */
export type Wider = { count: number; sample: RpcRow[]; relaxed: string[] };

export type StagedResult = {
  rows: RpcRow[];
  /** Every attempt, in order — the trace and the answer both need the whole path. */
  attempts: Attempt[];
  /** Candidates the unrelaxed query found, so "nothing there" is distinguishable
   *  from "we widened". */
  unrelaxed_count: number;
  relaxed: string[];
  note: string | null;
  /** Present when a location constraint was set and the local answer was thin. */
  wider: Wider | null;
  error: unknown;
};

/** Map our argument names onto the v2 parameter names, once, in one place. */
function toRpcArgs(a: SearchArgs, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    p_area_id: a.area_id ?? null,
    p_venue: a.venue ?? null,
    p_lat: a.lat ?? null,
    p_lng: a.lng ?? null,
    ...(a.radius_km != null ? { p_radius_km: a.radius_km } : {}),
    ...(a.date_from ? { p_date_from: a.date_from } : {}),
    ...(a.date_to ? { p_date_to: a.date_to } : {}),
    p_max_price_cents: a.max_price_cents ?? null,
    p_filter_category: a.filter_category ?? null,
    p_filter_subcategory: a.filter_subcategory ?? null,
    p_neighborhood: a.neighborhood ?? null,
    p_family: a.family_friendly ?? false,
    p_outdoor: a.outdoor ?? false,
    p_free: a.free_entry ?? false,
    ...extra,
  };
}

export async function runStaged(opts: {
  rpc: Rpc;
  base: SearchArgs;
  config: FloorConfig;
  /** Ranking inputs — inferred, so they order and never exclude. */
  rank: { category?: string | null; subcategory?: string | null; genres?: string[] | null };
  queryVector: string | null;
  queryText: string | null;
  limit: number;
  /** Wraps each attempt for tracing. Identity in tests. */
  observe?: <T>(name: string, input: Record<string, unknown>, fn: () => Promise<T>) => Promise<T>;
}): Promise<StagedResult> {
  const { rpc, base, config, rank, queryVector, queryText, limit } = opts;
  const observe = opts.observe ?? (async (_n, _i, fn) => fn());
  const rungs = ladder(base);
  const attempts: Attempt[] = [];
  const relaxed: string[] = [];
  let unrelaxedCount = 0;
  let best: RpcRow[] = [];
  let bestQualifying = -1;
  let bestRelaxed: string[] = [];
  let bestRung = rungs[0];
  let lastReason = "too_few";

  for (const rung of rungs) {
    const args = toRpcArgs(rung.args, {
      query_embedding: queryVector,
      ...(queryText ? { p_query_text: queryText.slice(0, 80) } : {}),
      p_rank_category: rank.category ?? null,
      p_rank_subcategory: rank.subcategory ?? null,
      p_rank_genres: rank.genres?.length ? rank.genres : null,
      p_limit: limit,
    });

    const res = await observe(
      rung.index === 0 ? "match-events" : "match-events-relaxed",
      { rung: rung.index, relaxed: rung.relaxed, ...args },
      () => rpc("match_events_v2", args)
    );
    if (res.error)
      return { rows: [], attempts, unrelaxed_count: 0, relaxed, note: null, wider: null, error: res.error };

    const rows = res.data ?? [];
    const s = sufficiency(rows, config, {
      hasEmbedding: queryVector !== null,
      priceLimitStated: base.max_price_cents != null,
    });
    lastReason = s.reason;

    if (rung.index === 0) unrelaxedCount = rows.length;
    if (rung.relaxed) relaxed.push(rung.relaxed);

    attempts.push({
      rung: rung.index,
      relaxed: rung.relaxed,
      location_source: (rows[0]?.area_resolved_by as string) ?? null,
      returned: rows.length,
      qualifying: s.qualifying.length,
      reason: s.reason,
      constraints: toRpcArgs(rung.args, {}),
      results: rows.map((row) => ({ id: row.id, similarity: row.similarity })),
      embedding_model: config?.embedding_model ?? null,
      embedding_dim: config?.embedding_dim ?? null,
      catalogue_observed_at: new Date().toISOString(),
    });

    // Keep the best set seen, so exhausting the ladder still answers with
    // something rather than the last (widest, possibly empty) attempt.
    if (s.qualifying.length > bestQualifying) {
      best = rows;
      bestQualifying = s.qualifying.length;
      bestRelaxed = [...relaxed];
      bestRung = rung;
    }

    if (s.ok) {
      const last = rungs[rungs.length - 1];
      // Answered without widening, but thinly, and a location was asked for: find
      // out what the rest of the city holds so the answer can offer it rather
      // than leaving the asker to guess whether tonight is quiet.
      const thin = s.qualifying.length < WIDER_HINT_BELOW;
      const wider =
        rung.relaxed === null && thin && rungs.length > 1
          ? await probeWider(rungs[rungs.length - 1], rung, rows)
          : null;
      return {
        rows,
        attempts,
        unrelaxed_count: unrelaxedCount,
        relaxed: [...relaxed],
        note: describeOutcome(rung, s, rung.index === last.index),
        wider,
        error: null,
      };
    }
  }

  // Ladder exhausted.
  const s = sufficiency(best, config, {
    hasEmbedding: queryVector !== null,
    priceLimitStated: base.max_price_cents != null,
  });
  return {
    rows: best,
    attempts,
    unrelaxed_count: unrelaxedCount,
    relaxed: bestRelaxed,
    note: describeOutcome(bestRung, { ...s, reason: lastReason as never }, true),
    wider: null, // the ladder already widened; there is no "beyond" left to offer
    error: null,
  };

  /** One extra call at the widest rung, for a count and a couple of examples.
   *
   *  Its rows are NOT substituted for the local ones. They are alternatives, and
   *  presenting them as answers is how "nothing nearby" turns into "here is the
   *  rest of Berlin" with nobody told the question was changed. */
  async function probeWider(widest: Rung, from: Rung, local: RpcRow[]): Promise<Wider | null> {
    const args = toRpcArgs(widest.args, {
      query_embedding: queryVector,
      ...(queryText ? { p_query_text: queryText.slice(0, 80) } : {}),
      p_rank_category: rank.category ?? null,
      p_rank_subcategory: rank.subcategory ?? null,
      p_rank_genres: rank.genres?.length ? rank.genres : null,
      p_limit: 20,
    });
    const res = await observe("match-events-wider", { probe: true, ...args }, () =>
      rpc("match_events_v2", args),
    );
    if (res.error || !res.data) return null;
    const localIds = new Set(local.map((r) => r.id));
    const extra = dedupe(res.data).filter((r) => !localIds.has(r.id));
    if (extra.length === 0) return null;
    return {
      count: extra.length,
      sample: extra.slice(0, 3),
      relaxed: widest.args.area_id === from.args.area_id ? ["radius"] : ["area"],
    };
  }
}
