import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/anon";
export const dynamic = "force-dynamic";

/**
 * Flexible event search endpoint for LLM function calling.
 * Query params:
 *   q        - text search (matches title, venue_name, description, tags)
 *   category - filter by category (comma-separated)
 *   neighborhood - filter by neighborhood
 *   from     - start date (YYYY-MM-DD), defaults to today
 *   to       - end date (YYYY-MM-DD), defaults to from + 7 days
 *   limit    - max results (default 20, max 50)
 */
// User input lands inside PostgREST .or() filter strings — strip the
// characters that have meaning there (clause separators, wildcards, quotes)
function sanitizeFilterInput(s: string): string {
  return s.replace(/[,()%_'"\\]/g, " ").replace(/\s+/g, " ").trim();
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const q = sanitizeFilterInput(params.get("q")?.toLowerCase() || "") || undefined;
  const category = params.get("category");
  const neighborhood = sanitizeFilterInput(params.get("neighborhood") || "") || undefined;
  const fromDate = params.get("from");
  const toDate = params.get("to");
  const limit = Math.min(parseInt(params.get("limit") || "20"), 50);

  // Default time window: today to +7 days
  const now = new Date();
  const berlinDate = (d: Date) => {
    const parts = d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }).split("-");
    return `${parts[0]}-${parts[1]}-${parts[2]}`;
  };
  const todayStr = berlinDate(now);
  const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const weekStr = berlinDate(weekLater);

  const startFilter = fromDate || todayStr;
  const endFilter = toDate || weekStr;

  let query = supabase
    .from("events_with_coords")
    .select("id,title,venue_name,neighborhood,address,start_time,end_time,category,subcategory,description,price,tags,lat,lng")
    .eq("status", "active")
    .eq("is_active", true)
    .gte("start_time", `${startFilter}T00:00:00`)
    .lte("start_time", `${endFilter}T23:59:59`);

  if (category) {
    query = query.in("category", category.split(","));
  }

  if (neighborhood) {
    query = query.or(
      `neighborhood.ilike.%${neighborhood}%,address.ilike.%${neighborhood}%`
    );
  }

  // Text search: use ilike on title, venue, description, neighborhood, address
  if (q) {
    query = query.or(
      `title.ilike.%${q}%,venue_name.ilike.%${q}%,description.ilike.%${q}%,neighborhood.ilike.%${q}%,address.ilike.%${q}%`
    );
  }

  query = query.order("start_time", { ascending: true }).limit(limit);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Format for LLM consumption: compact but informative
  const results = (data || []).map((e) => ({
    id: e.id,
    title: e.title,
    venue: e.venue_name,
    neighborhood: e.neighborhood,
    address: e.address,
    start: e.start_time,
    end: e.end_time,
    category: e.category,
    subcategory: e.subcategory,
    price: e.price,
    description: e.description?.slice(0, 200),
    tags: e.tags,
    lat: e.lat,
    lng: e.lng,
  }));

  return NextResponse.json({ count: results.length, events: results });
}
