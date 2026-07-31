import { supabaseAnon } from "./anonClient";

// Canonical taxonomy from the DB (unify-taxonomy §3.2): the tool enums are GENERATED
// from this — no hardcoded category lists anywhere in the chat path.
let cache: { categories: string[]; subcategories: string[]; at: number } | null = null;
const TTL_MS = 10 * 60 * 1000;

export async function getTaxonomy(): Promise<{ categories: string[]; subcategories: string[] }> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  const { data, error } = await supabaseAnon
    .from("taxonomy")
    .select("category_slug, subcategory_slug")
    .eq("is_active", true);
  if (error || !data?.length) {
    // degrade: previous cache if any, else empty enums (tools fall back to free strings)
    if (cache) return cache;
    return { categories: [], subcategories: [] };
  }
  const categories = [...new Set(data.map((r) => r.category_slug))].sort();
  const subcategories = [
    ...new Set(data.map((r) => r.subcategory_slug).filter((s): s is string => !!s)),
  ].sort();
  cache = { categories, subcategories, at: Date.now() };
  return cache;
}
