/**
 * Staged retrieval: the deterministic relaxation ladder (FEAT-25).
 *
 * Replaces the `rows === 0` trigger in search_events. On 3 September a search for
 * comedy in Prenzlauer Berg returned three weakly-matching events and stopped,
 * because three is not zero — while stronger comedy sat one constraint away. Row
 * count is not a quality test.
 *
 * Two rules the old logic broke:
 *
 *   1. Relax LOCATION, never meaning. The previous ladder dropped taxonomy and
 *      never widened the area, so "comedy in Prenzlauer Berg" could only ever
 *      answer with Prenzlauer Berg or nothing. Taxonomy is now a ranking input
 *      to match_events_v2 and never a gate, so there is nothing to drop.
 *   2. The MODEL never decides to widen. Rungs are chosen here; the model
 *      receives results plus metadata and says what happened.
 *
 * Everything in this file is pure. The ladder is data, sufficiency is a
 * function of rows — both testable without a database or a model.
 */

/** Constraints that may be relaxed, in the order they are given up. */
export type SearchArgs = {
  query?: string | null;
  venue?: string | null;
  area_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  radius_km?: number | null;
  // always hard — never appear in a rung transformation
  date_from?: string | null;
  date_to?: string | null;
  max_price_cents?: number | null;
  filter_category?: string | null;
  filter_subcategory?: string | null;
  neighborhood?: string | null;
  family_friendly?: boolean | null;
  outdoor?: boolean | null;
  free_entry?: boolean | null;
};

export type Rung = {
  /** 0 = nothing relaxed. */
  index: number;
  /** What this rung gave up, for the answer and the trace. Null at rung 0. */
  relaxed: string | null;
  args: SearchArgs;
};

export type Row = {
  id: string;
  similarity: number | null;
  price_qualifies: boolean;
  price_unknown: boolean;
  dedup_key?: string | null;
};

/** The one active row of retrieval_config, or null when none is calibrated. */
export type FloorConfig = {
  floor: number;
  k: number;
  embedding_model: string;
  embedding_dim: number;
} | null;

/** How many results end an uncalibrated search. Deliberately the same as the
 *  usual default: without a floor, count is all we have. */
export const UNCALIBRATED_K = 3;

export type Sufficiency = {
  ok: boolean;
  /** Rows that count toward k, after dedup and price filtering. */
  qualifying: Row[];
  /** Why the decision went the way it did — surfaced to the trace, not the user. */
  reason:
    | "sufficient"
    | "below_floor"
    | "too_few"
    | "threshold_not_applicable"
    | "uncalibrated";
};

/**
 * The ladder for a given search. One constraint per rung, most specific first.
 *
 * A constraint that was never set produces no rung: relaxing something the user
 * did not ask for is a wasted round-trip, and the trace would claim a widening
 * that never narrowed anything.
 */
export function ladder(base: SearchArgs): Rung[] {
  const rungs: Rung[] = [{ index: 0, relaxed: null, args: base }];
  let cur = base;

  if (base.venue) {
    cur = { ...cur, venue: null };
    rungs.push({ index: rungs.length, relaxed: "venue", args: cur });
  }
  // area -> radius around its centroid. The caller supplies the centroid as
  // lat/lng; if it has none, this rung would be identical to the next, so skip it.
  if (base.area_id && base.lat != null && base.lng != null) {
    cur = { ...cur, area_id: null, radius_km: cur.radius_km ?? 3 };
    rungs.push({ index: rungs.length, relaxed: "area", args: cur });
  } else if (base.area_id) {
    cur = { ...cur, area_id: null };
    rungs.push({ index: rungs.length, relaxed: "area", args: cur });
  }
  if (cur.lat != null || cur.radius_km != null) {
    cur = { ...cur, lat: null, lng: null, radius_km: null };
    rungs.push({ index: rungs.length, relaxed: "radius", args: cur });
  }
  return rungs;
}

/** Collapse duplicates before anything counts them. */
export function dedupe(rows: Row[]): Row[] {
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const r of rows) {
    // No dedup_key yet (FEAT-23 owns it) — fall back to id, which is at worst
    // a no-op. Never drop a row for lack of a key.
    const key = r.dedup_key ?? r.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Does this result set end the search?
 *
 * @param hasEmbedding whether a query vector was supplied. Without one every
 *   similarity is null, so the floor cannot apply and the test degrades to a
 *   count — recorded, so nobody reads it as a quality judgement.
 * @param priceLimitStated whether the user named a price. Unknown-price rows may
 *   be shown as alternatives but can never satisfy "under 15 euro".
 */
export function sufficiency(
  rows: Row[],
  cfg: FloorConfig,
  opts: { hasEmbedding: boolean; priceLimitStated: boolean }
): Sufficiency {
  const distinct = dedupe(rows);
  const eligible = opts.priceLimitStated
    ? distinct.filter((r) => r.price_qualifies && !r.price_unknown)
    : distinct;

  // No calibrated floor: we still refuse to invent one, but stopping dead at rung
  // 0 was wrong. It made an over-constrained first attempt final — a search
  // narrowed to one Kiez returned ten mediocre results and never widened, which
  // is the same "it found something, so it stopped" failure in a new costume.
  // Fall back to a COUNT, which is honest about being weaker, and keep widening.
  if (!cfg) {
    return eligible.length >= UNCALIBRATED_K
      ? { ok: true, qualifying: eligible, reason: "uncalibrated" }
      : { ok: false, qualifying: eligible, reason: "uncalibrated" };
  }

  if (!opts.hasEmbedding) {
    return eligible.length >= cfg.k
      ? { ok: true, qualifying: eligible, reason: "threshold_not_applicable" }
      : { ok: false, qualifying: eligible, reason: "too_few" };
  }

  // A null similarity never satisfies a floor.
  const scored = eligible.filter((r) => r.similarity != null && r.similarity >= cfg.floor);
  if (scored.length >= cfg.k) return { ok: true, qualifying: scored, reason: "sufficient" };
  return {
    ok: false,
    qualifying: scored,
    reason: scored.length === 0 ? "below_floor" : "too_few",
  };
}

/**
 * How the answer must describe a result set. The model verbalises this; it does
 * not decide it. Without it a widened result reads as a local one, which is a
 * worse failure than an empty answer because it is invisible.
 */
export function describe(rung: Rung, s: Sufficiency, exhausted: boolean): string | null {
  if (s.reason === "uncalibrated")
    return "relevance filtering is uncalibrated, so these are unranked matches — say they may be rough";
  if (exhausted && s.qualifying.length === 0)
    return "nothing matched anywhere in the city — say so plainly and do not offer unrelated events";
  if (exhausted && !s.ok)
    return `only ${s.qualifying.length} match, fewer than usual — say so rather than padding the list`;
  if (rung.relaxed)
    return `no match with the original ${rung.relaxed}, so the search was widened — say the results are outside what was asked for`;
  return null;
}
