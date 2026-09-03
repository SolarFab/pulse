import { supabaseAnon } from "./anonClient";

// Canonical taxonomy from the DB (unify-taxonomy §3.2): the tool enums are GENERATED
// from this — no hardcoded category lists anywhere in the chat path.
// genre-dimension §3.1 adds genres, which live in the same table under kind='genre'.
export type Area = { area_id: string; centroid_lat: number | null; centroid_lng: number | null };
type Taxonomy = { categories: string[]; subcategories: string[]; genres: string[]; areas: Area[] };
let cache: (Taxonomy & { at: number }) | null = null;
const TTL_MS = 10 * 60 * 1000;

export async function getTaxonomy(): Promise<Taxonomy> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  const { data, error } = await supabaseAnon
    .from("taxonomy")
    .select("kind, category_slug, subcategory_slug")
    .eq("is_active", true);
  if (error || !data?.length) {
    // degrade: previous cache if any, else empty enums (tools fall back to free strings)
    if (cache) return cache;
    return { categories: [], subcategories: [], genres: [], areas: [] };
  }
  // Rows are kind-tagged; category_slug carries the leading slug for every kind,
  // so genre rows read their slug from the same column.
  const byKind = (kind: string) => data.filter((r) => r.kind === kind);
  const categories = [...new Set(byKind("category").map((r) => r.category_slug))].sort();
  const subcategories = [
    ...new Set(byKind("subcategory").map((r) => r.subcategory_slug).filter((s): s is string => !!s)),
  ].sort();
  const genres = [...new Set(byKind("genre").map((r) => r.category_slug))].sort();

  // Canonical area ids, so the tool enum is generated rather than hardcoded — the
  // same rule the taxonomy already follows. With the enum in place the model can
  // only name an area that exists, which is what keeps a raw location string from
  // reaching SQL. Degrades to an empty list, and the tool falls back to a free
  // string; the RPC still validates and answers area_unknown.
  const { data: areaRows } = await supabaseAnon
    .from("areas")
    .select("area_id,centroid_lat,centroid_lng");
  const areas = (areaRows ?? [])
    .map((r) => ({
      area_id: r.area_id as string,
      centroid_lat: r.centroid_lat == null ? null : Number(r.centroid_lat),
      centroid_lng: r.centroid_lng == null ? null : Number(r.centroid_lng),
    }))
    .sort((a, b) => a.area_id.localeCompare(b.area_id));

  cache = { categories, subcategories, genres, areas, at: Date.now() };
  return cache;
}
