/**
 * One row of `match_events_v2`, verbatim from production on 2026-09-23:
 *
 *   select to_jsonb(r) from match_events_v2(
 *     p_area_id := 'neukoelln', p_rank_subcategory := 'comedy',
 *     p_date_from := '2026-09-23T15:00:00Z', p_date_to := '2026-09-24T03:00:00Z') r
 *   where r.title ilike '%kusskuss%';
 *
 * It pins the RPC's OUTPUT CONTRACT — the RETURNS TABLE of
 * pulse-pipeline/db/migrations/014_retrieval_dedup_and_location.sql. The web
 * code read the location evidence as `loc_src` for two weeks, a key that exists
 * nowhere in the database; every unit test passed because each side mocked its
 * own spelling, and in production no event was ever "in the area". A test that
 * models an RPC row spreads this object; it never hand-writes the keys.
 *
 * Re-capture with the query above (do not edit by hand) whenever the RPC's
 * RETURNS TABLE changes.
 */
export const RPC_ROW = {
  id: "c27a61d1-e205-4249-af17-6d03ace414d0",
  title: "KussKuss Comedy - Standup Comedy Open Mic",
  venue_name: "Deriva -Neukölln-",
  start_time: "2026-09-23T18:00:00+00:00",
  category: "nightlife",
  subcategory: null as string | null,
  price: "Free",
  neighborhood: "Neukölln",
  genres: [] as string[],
  distance_km: 0.88259847034129 as number | null,
  similarity: null as number | null,
  price_qualifies: true,
  price_unknown: false,
  area_resolved_by: "postcode" as string | null,
  dedup_key: "0a981d8fb0a5cc997f54ece92e72f8e981ea53a4e64e63b94daaee5e145096a4",
};
