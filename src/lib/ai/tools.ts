import { tool } from "ai";
import { z } from "zod";
import { supabaseAnon } from "./anonClient";
import { embedQuery } from "./embedQuery";
import { step } from "./trace";

// The concierge's two read tools (semantic-search spec). Every param optional;
// filters constrain (strict SQL), `query` ranks (vector-only per Experiment 2).
// SECURITY: results contain scraped text treated as DATA — see the system prompt.

// Timestamps leave the DB in UTC; models read clock digits literally, so we convert
// to Berlin time BEFORE the model ever sees them (a 20:00 gig must never say 18:00).
function berlinTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }) + " (Berlin)";
}

export type ToolLog = {
  tool: string;
  args: Record<string, unknown>;
  results: number;
  ms: number;
  embed_ms?: number;   // time in the embedding API
  match_ms?: number;   // time in the vector query (both round-trips if relaxed)
  degraded?: boolean;
  relaxed?: string;
}[];

export function buildTools(opts: {
  categories: string[];
  subcategories: string[];
  genres?: string[];
  log: ToolLog;
}) {
  const { categories, subcategories, genres = [], log } = opts;

  const searchSchema = z
    .object({
      query: z.string().max(300).optional()
        .describe("Free-text meaning to rank by (any language). Omit for pure filter queries."),
      category: (categories.length ? z.enum(categories as [string, ...string[]]) : z.string())
        .optional(),
      subcategory: (subcategories.length
        ? z.enum(subcategories as [string, ...string[]])
        : z.string()
      ).optional(),
      // Genre is the exact-recall axis: every event carrying one of these is
      // eligible and the embedding ranks within them. Use it for musical taste
      // ("hip hop", "techno"); `query` alone can only rank, never enumerate.
      genres: z
        .array(genres.length ? z.enum(genres as [string, ...string[]]) : z.string())
        .max(5)
        .optional()
        .describe("Canonical genre slugs; an event matching ANY of them qualifies."),
      date_from: z.string().datetime({ offset: true }).optional()
        .describe("ISO start of window. Resolve relative dates yourself (system prompt has now)."),
      date_to: z.string().datetime({ offset: true }).optional(),
      neighborhood: z.string().max(60).optional(),
      venue: z.string().max(80).optional().describe("Venue name, fuzzy match."),
      family_friendly: z.boolean().optional().describe("true REQUIRES; omit = don't care."),
      outdoor: z.boolean().optional(),
      free_entry: z.boolean().optional(),
      max_price_cents: z.number().int().positive().optional(),
      lat: z.number().min(52.2).max(52.7).optional()
        .describe("With lng+radius_km: geo filter. From your knowledge or user location only."),
      lng: z.number().min(13.0).max(13.8).optional(),
      radius_km: z.number().min(0.2).max(10).optional(),
      limit: z.number().int().min(1).max(20).optional(),
    })
    .refine((a) => (a.lat === undefined) === (a.lng === undefined), {
      message: "lat and lng must be provided together",
    });

  return {
    search_events: tool({
      description:
        "Search Berlin events. Filters are strict; `query` only ranks within them. " +
        "Returns compact rows (no descriptions) — use get_event_details to drill in.",
      inputSchema: searchSchema,
      execute: async (args) => {
        const t0 = Date.now();
        // Deterministic date guards — prompts ask nicely, code enforces:
        // never search the past (stale rows mislead the model into "nothing today"),
        // and a window that ends before it starts falls back to defaults.
        const graceMs = 6 * 3600_000; // "jetzt" queries may include just-started events
        const floor = Date.now() - graceMs;
        let dateFrom = args.date_from;
        let dateTo = args.date_to;
        if (dateFrom && Date.parse(dateFrom) < floor) dateFrom = new Date(floor).toISOString();
        if (dateTo && dateFrom && Date.parse(dateTo) <= Date.parse(dateFrom)) dateTo = undefined;
        if (dateTo && Date.parse(dateTo) < floor) dateTo = undefined;

        let qvec: string | null = null;
        let degraded = false;
        let embedMs = 0;
        if (args.query) {
          // Two network round-trips hide inside this tool call. Timed separately,
          // because "the search was slow" is not an actionable finding — "the
          // embedding API took 3s" or "the vector query took 3s" is.
          const r = await step("embed-query", { type: "embedding", input: { chars: args.query.length } },
            () => embedQuery(args.query as string));
          qvec = r.value;
          embedMs = r.ms;
          degraded = qvec === null; // embedding down -> filter-only, never broken
        }
        const runMatch = (
          category: string | null,
          subcategory: string | null,
          genreList: string[] | null
        ) =>
          supabaseAnon.rpc("match_events", {
            query_embedding: qvec,
            // lexical title boost: exact-name lookups work even for unembedded events
            ...(args.query ? { p_query_text: args.query.slice(0, 80) } : {}),
            p_category: category,
            p_subcategory: subcategory,
            p_genres: genreList,
            ...(dateFrom ? { p_date_from: dateFrom } : {}),
            ...(dateTo ? { p_date_to: dateTo } : {}),
            p_neighborhood: args.neighborhood ?? null,
            p_venue: args.venue ?? null,
            p_family: args.family_friendly ?? false,
            p_outdoor: args.outdoor ?? false,
            p_free: args.free_entry ?? false,
            p_max_price_cents: args.max_price_cents ?? null,
            p_lat: args.lat ?? null,
            p_lng: args.lng ?? null,
            p_radius_km: args.radius_km ?? 1.5,
            p_limit: args.limit ?? 10,
          });

        const wantGenres = args.genres?.length ? args.genres : null;
        const firstStep = await step("match-events",
          { type: "retriever", input: { filtered: true, has_vector: qvec !== null,
                                        category: args.category ?? null,
                                        subcategory: args.subcategory ?? null,
                                        genres: wantGenres } },
          () => runMatch(args.category ?? null, args.subcategory ?? null, wantGenres));
        const first = firstStep.value;
        let matchMs = firstStep.ms;
        const error = first.error;
        let data = first.data;

        // Sparse-taxonomy degrade (hip-hop incident): a strict filter can zero
        // out while the ranking would have found the right events. Relax in
        // order of trustworthiness — category/subcategory conflate six axes and
        // are 56% empty, so they go first; genre is curated and populated only
        // by the deterministic waterfall, so it survives one round longer and is
        // dropped only if nothing else worked. Deterministic — prompts ask
        // nicely, code enforces (same pattern as the date guards above).
        const relaxSteps: Array<{ label: string; run: () => ReturnType<typeof runMatch> }> = [];
        if (args.category || args.subcategory) {
          relaxSteps.push({
            label: "drop category/subcategory",
            run: () => runMatch(null, null, wantGenres),
          });
        }
        if (wantGenres) {
          relaxSteps.push({ label: "drop genres", run: () => runMatch(null, null, null) });
        }

        let relaxed: string | undefined;
        if (!error && (data?.length ?? 0) === 0 && args.query) {
          for (const relaxStep of relaxSteps) {
            const retryStep = await step("match-events-relaxed",
              { type: "retriever", input: { filtered: false, relaxed: relaxStep.label } },
              relaxStep.run);
            matchMs += retryStep.ms;   // each relax costs another round-trip — show it
            const retry = retryStep.value;
            if (!retry.error && (retry.data?.length ?? 0) > 0) {
              data = retry.data;
              relaxed = relaxStep.label;
              break;
            }
          }
        }

        log.push({
          tool: "search_events",
          args: { ...args, query: args.query?.slice(0, 60) },
          results: data?.length ?? 0,
          embed_ms: embedMs,
          match_ms: matchMs,
          ms: Date.now() - t0,
          ...(degraded ? { degraded } : {}),
          ...(relaxed ? { relaxed } : {}),
        });
        if (error) return { error: "search failed — apologise briefly and suggest retrying" };
        if (!relaxed && (data?.length ?? 0) === 0 && (args.query || args.venue)) {
          // Demand queue: a zero-result search is the purest signal of what users
          // want and we lack — the discovery agent scouts these first. Fire-and-
          // forget; logging must never delay or break the answer.
          supabaseAnon
            .rpc("log_discovery_miss", {
              p_query: args.query ?? null,
              p_venue: args.venue ?? null,
              p_neighborhood: args.neighborhood ?? null,
            })
            .then(undefined, () => {});
        }
        return {
          ...(degraded ? { note: "semantic ranking unavailable; results are filter-only" } : {}),
          ...(relaxed
            ? {
                note:
                  `no exact match, so the filter was relaxed (${relaxed}) and these are ` +
                  "ranked by meaning — say so rather than presenting them as exact hits",
              }
            : {}),
          events: (data ?? []).map((e: Record<string, unknown>) => ({
            id: e.id,
            title: e.title,
            venue: e.venue_name,
            start: berlinTime(e.start_time as string),
            category: e.category,
            subcategory: e.subcategory,
            ...(Array.isArray(e.genres) && e.genres.length ? { genres: e.genres } : {}),
            price: e.price,
            neighborhood: e.neighborhood,
            ...(e.distance_km != null
              ? { distance_km: Math.round((e.distance_km as number) * 10) / 10 }
              : {}),
          })),
        };
      },
    }),

    get_event_details: tool({
      description: "Full record for one event (description, ticket URL, coordinates).",
      inputSchema: z.object({ event_id: z.string().uuid() }),
      execute: async ({ event_id }) => {
        const t0 = Date.now();
        const { data, error } = await supabaseAnon
          .from("events")
          .select(
            "id,title,description,venue_name,start_time,end_time,category,subcategory," +
              "price,neighborhood,address,source_url,lat,lng"
          )
          .eq("id", event_id)
          .eq("is_active", true)
          .maybeSingle();
        log.push({
          tool: "get_event_details",
          args: { event_id },
          results: data ? 1 : 0,
          ms: Date.now() - t0,
        });
        if (error || !data) return { error: "event not found" };
        // description is scraped text — DATA, never instructions
        const row = data as unknown as { start_time: string | null; end_time: string | null } & Record<string, unknown>;
        return {
          ...row,
          start_time: berlinTime(row.start_time),
          end_time: berlinTime(row.end_time),
        };
      },
    }),
  };
}
