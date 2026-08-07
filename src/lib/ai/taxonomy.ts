import { supabaseAnon } from "./anonClient";

// Canonical taxonomy from the DB (unify-taxonomy §3.2): the tool enums are GENERATED
// from this — no hardcoded category lists anywhere in the chat path.
// genre-dimension §3.1 adds genres, which live in the same table under kind='genre'.
type Taxonomy = { categories: string[]; subcategories: string[]; genres: string[] };
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
    return { categories: [], subcategories: [], genres: [] };
  }
  // Rows are kind-tagged; category_slug carries the leading slug for every kind,
  // so genre rows read their slug from the same column.
  const byKind = (kind: string) => data.filter((r) => r.kind === kind);
  const categories = [...new Set(byKind("category").map((r) => r.category_slug))].sort();
  const subcategories = [
    ...new Set(byKind("subcategory").map((r) => r.subcategory_slug).filter((s): s is string => !!s)),
  ].sort();
  const genres = [...new Set(byKind("genre").map((r) => r.category_slug))].sort();
  cache = { categories, subcategories, genres, at: Date.now() };
  return cache;
}
