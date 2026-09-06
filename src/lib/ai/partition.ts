/**
 * Retrieve wide, rank in code, show narrow.
 *
 * The RPC returns up to ~100 candidates for the date window, ranked by
 * similarity and annotated with `loc_src` — the strongest evidence tying each
 * row to the area the user named, or null. Nothing was excluded on location.
 * This file decides what the user sees: the in-area answer first, an honest
 * count of what exists beyond it, and the nearest few as an offer.
 *
 * Why not decide this in SQL: with a date window the candidate set is ~400
 * rows. Every exclusion there was a way to lose a venue whose postcode and
 * label disagree. A plain "comedy tonight" ranked Cosmic Comedy fifth.
 *
 * Everything here is pure and runs on arrays.
 */

export type Row = {
  id: string;
  similarity: number | null;
  loc_src: string | null;
  distance_km: number | null;
  price_qualifies: boolean;
  price_unknown: boolean;
  dedup_key?: string | null;
} & Record<string, unknown>;

export type Groups = { inArea: Row[]; nearby: Row[]; elsewhere: Row[] };

export type Counts = { in_area: number; nearby: number; elsewhere: number; total: number };

/** Tiers that mean "this is in the area", strongest first. */
const IN_AREA = new Set(["postcode", "district", "neighborhood_label"]);

/** Beyond this the row is "elsewhere in Berlin", not "nearby". */
export const NEARBY_KM = 3;

/**
 * Split rows by their relation to the requested area. Order within each group
 * is preserved from the RPC, which already ranked by title match, taxonomy
 * agreement, location evidence, similarity, distance and time.
 */
export function partition(rows: Row[], opts: { areaAsked: boolean; nearKm?: number }): Groups {
  const near = opts.nearKm ?? NEARBY_KM;
  if (!opts.areaAsked) return { inArea: [], nearby: [], elsewhere: rows };
  const g: Groups = { inArea: [], nearby: [], elsewhere: [] };
  for (const r of rows) {
    if (r.loc_src && IN_AREA.has(r.loc_src)) g.inArea.push(r);
    else if (r.loc_src === "centroid_radius" || (r.distance_km != null && r.distance_km <= near))
      g.nearby.push(r);
    else g.elsewhere.push(r);
  }
  return g;
}

/**
 * Under a stated price limit, rows with an unknown price cannot be the answer.
 * They may still be offered, labelled — but they never count toward "found N".
 */
export function priceEligible(rows: Row[], priceLimitStated: boolean): Row[] {
  return priceLimitStated ? rows.filter((r) => r.price_qualifies && !r.price_unknown) : rows;
}

export type Presentation = {
  /** What to answer with. */
  events: Row[];
  counts: Counts;
  /** Nearest alternatives beyond the answer, for the model to OFFER, not list. */
  offers: Row[];
  /** Verbatim instruction to the model. Null when nothing needs saying. */
  note: string | null;
};

/**
 * Choose what the model is shown. `show` is the presentation count — how many
 * events make a good chat answer — and is unrelated to retrieval breadth.
 */
export function present(
  groups: Groups,
  opts: { areaAsked: boolean; areaName?: string | null; show: number; offer?: number }
): Presentation {
  const offerN = opts.offer ?? 3;
  const counts: Counts = {
    in_area: groups.inArea.length,
    nearby: groups.nearby.length,
    elsewhere: groups.elsewhere.length,
    total: groups.inArea.length + groups.nearby.length + groups.elsewhere.length,
  };

  if (!opts.areaAsked) {
    const events = groups.elsewhere.slice(0, opts.show);
    const rest = counts.total - events.length;
    return {
      events,
      counts,
      offers: [],
      note:
        counts.total === 0
          ? "nothing matched — say so plainly and do not offer unrelated events"
          : rest > 0
            ? `showing ${events.length} of ${counts.total}; say how many more there are and offer to list them`
            : null,
    };
  }

  const where = opts.areaName ?? "the area asked for";
  const events = groups.inArea.slice(0, opts.show);
  const beyond = [...groups.nearby, ...groups.elsewhere];
  const offers = beyond.slice(0, offerN);
  const beyondCount = counts.nearby + counts.elsewhere;

  let note: string | null;
  if (counts.in_area === 0 && beyondCount === 0)
    note = `nothing matched in ${where} or anywhere else — say so plainly and do not offer unrelated events`;
  else if (counts.in_area === 0)
    note = `nothing in ${where}; ${beyondCount} exist elsewhere — say that first, then offer the nearest (offers), with distances`;
  else if (beyondCount > 0)
    note = `${counts.in_area} in ${where}, ${beyondCount} more across Berlin (${counts.nearby} within ${NEARBY_KM} km) — answer with the local ones, give both numbers, and offer the nearest (offers)`;
  else note = null;

  return { events, counts, offers, note };
}
