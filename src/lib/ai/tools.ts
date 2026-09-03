import { tool } from "ai";
import { z } from "zod";
import { supabaseAnon } from "./anonClient";
import { embedQuery } from "./embedQuery";
import { step } from "./trace";
import { runStaged } from "./stagedSearch";
import { loadRetrievalConfig } from "./retrievalConfig";

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
  /** Routing evidence — which rungs ran, what each returned, and why it stopped.
   *  Without it an empty or narrow answer can only be diagnosed from the
   *  database, which is exactly what happened on 2 September. */
  attempts?: Array<{
    rung: number; relaxed: string | null; location_source: string | null;
    returned: number; qualifying: number; reason: string;
  }>;
  unrelaxed_count?: number;
  location_source?: string | null;
  config_state?: string;
}[];

export function buildTools(opts: {
  /** Canonical area ids from the `areas` table. The model picks one of these, so
   *  a raw location string can never become a SQL identifier. */
  areas?: string[];
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
      area_id: (opts.areas?.length
        ? z.enum(opts.areas as [string, ...string[]])
        : z.string()
      ).optional()
        .describe(
          "Canonical Kiez id — prefer this over neighborhood. If none fits, omit it; " +
          "the search widens on its own and says so."
        ),
      neighborhood: z.string().max(60).optional()
        .describe("Legacy free-text area. Use area_id when one matches."),
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
        // The ladder decides what to widen and when to stop — not the model, and
        // not a row count. `rows === 0` is what let three weak comedy results
        // suppress relaxation on 3 September while stronger events sat one
        // constraint away.
        let matchMs = 0;
        const { config, reason: configReason } = await loadRetrievalConfig();
        const staged = await runStaged({
          rpc: (fn, a) => supabaseAnon.rpc(fn, a) as never,
          base: {
            query: args.query ?? null,
            venue: args.venue ?? null,
            area_id: args.area_id ?? null,
            lat: args.lat ?? null,
            lng: args.lng ?? null,
            radius_km: args.radius_km ?? null,
            date_from: dateFrom ?? null,
            date_to: dateTo ?? null,
            max_price_cents: args.max_price_cents ?? null,
            // Only an explicit UI selection is ever a hard taxonomy filter.
            filter_category: null,
            filter_subcategory: null,
          },
          config,
          // Inferred taxonomy ranks. It never excludes — 45 of 97 comedy events
          // carry no subcategory, so gating on it hides the catalogue.
          rank: {
            category: args.category ?? null,
            subcategory: args.subcategory ?? null,
            genres: args.genres?.length ? args.genres : null,
          },
          queryVector: qvec,
          queryText: args.query ?? null,
          limit: args.limit ?? 10,
          observe: (name, input, fn) =>
            step(name, { type: "retriever", input }, fn).then((r) => r.value),
        });

        const error = staged.error;
        const data = staged.rows;
        const relaxed = staged.relaxed.length ? staged.relaxed.join(" then ") : undefined;
        matchMs = Date.now() - t0 - embedMs;

        log.push({
          tool: "search_events",
          args: { ...args, query: args.query?.slice(0, 60) },
          results: data?.length ?? 0,
          embed_ms: embedMs,
          match_ms: matchMs,
          ms: Date.now() - t0,
          // Routing evidence: without it a complaint about an empty or narrow
          // answer can only be diagnosed from the database, which is exactly
          // what happened on 2 September.
          attempts: staged.attempts,
          unrelaxed_count: staged.unrelaxed_count,
          location_source: staged.attempts.at(-1)?.location_source ?? null,
          config_state: configReason,
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
          // What the ladder decided, verbatim. The model verbalises this; it does
          // not get to decide whether the search was widened.
          ...(staged.note ? { note: staged.note } : {}),
          meta: {
            widened: staged.relaxed,
            location_source: staged.attempts.at(-1)?.location_source ?? null,
            unrelaxed_count: staged.unrelaxed_count,
          },
          events: (data ?? []).map((e) => ({
            ...e,
            ...(e.price_unknown ? { price_note: "price unknown — do not state it as within a budget" } : {}),
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
