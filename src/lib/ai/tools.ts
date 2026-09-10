import { tool } from "ai";
import { z } from "zod";
import { supabaseAnon } from "./anonClient";
import { embedQuery } from "./embedQuery";
import { step } from "./trace";
import { partition, present, priceEligible, type Row } from "./partition";
import { resolveWhen, WHEN } from "./when";
import type { Area } from "./taxonomy";

// Retrieval breadth — unrelated to how many the user sees. Measured: latency is
// flat in the limit (~474 bytes/row); the vector scan is paid regardless.
const RETRIEVAL_BREADTH = 100;

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
  /** What was found and where, so an empty or narrow answer can be diagnosed
   *  from the log rather than from the database. */
  counts?: { in_area: number; nearby: number; elsewhere: number; total: number };
}[];

export function buildTools(opts: {
  /** Canonical area ids from the `areas` table. The model picks one of these, so
   *  a raw location string can never become a SQL identifier. */
  areas?: Area[];
  categories: string[];
  subcategories: string[];
  genres?: string[];
  log: ToolLog;
}) {
  const { categories, subcategories, genres = [], log } = opts;
  const areaIds = opts.areas?.map((area) => area.area_id) ?? [];
  const areaById = new Map(opts.areas?.map((area) => [area.area_id, area]) ?? []);

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
      when: z.enum(WHEN).optional()
        .describe("A relative time word: now | tonight | today | tomorrow | weekend | week. " +
                  "ALWAYS use this for relative phrases; code resolves it in Berlin time. " +
                  "Only use date_from/date_to for an explicit date the user named."),
      date_from: z.string().datetime({ offset: true }).optional()
        .describe("ISO start of window. Resolve relative dates yourself (system prompt has now)."),
      date_to: z.string().datetime({ offset: true }).optional(),
      area_id: (areaIds.length
        ? z.enum(areaIds as [string, ...string[]])
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
      limit: z.number().int().min(1).max(10).optional()
        .describe("How many events to SHOW (default 5). Retrieval is always broad; this is presentation."),
    })
    .refine((a) => (a.lat === undefined) === (a.lng === undefined), {
      message: "lat and lng must be provided together",
    });

  return {
    search_events: tool({
      description:
        "Search Berlin events. Explicit date, price, family, outdoor and free-entry constraints are strict; location may widen and meaning ranks. " +
        "Returns compact rows (no descriptions) — use get_event_details to drill in.",
      inputSchema: searchSchema,
      execute: async (args) => {
        const t0 = Date.now();
        // Deterministic date guards — prompts ask nicely, code enforces:
        // never search the past (stale rows mislead the model into "nothing today"),
        // and a window that ends before it starts falls back to defaults.
        const graceMs = 6 * 3600_000; // "jetzt" queries may include just-started events
        const floor = Date.now() - graceMs;
        // A relative word wins over model-written ISO. "Jazz tonight?" at 19:30
        // Berlin once became p_date_from 19:30:00Z — the wall-clock with a Z —
        // and excluded six of seven jazz events that had just started.
        const resolved = args.when ? resolveWhen(args.when) : null;
        let dateFrom = resolved?.from ?? args.date_from;
        let dateTo = resolved?.to ?? args.date_to;
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
        // Retrieve wide, rank in code, show narrow. One query for the whole date
        // window (~400 rows tonight), ranked by similarity and ANNOTATED with
        // location evidence — nothing excluded on location. Every exclusion in
        // SQL was a way to lose Cosmic Comedy; a plain "comedy tonight" ranks it
        // fifth. Inferred taxonomy ranks too, never gates: 45 of 97 comedy
        // events carry no subcategory.
        const selectedArea = args.area_id ? areaById.get(args.area_id) : undefined;
        const rpcArgs = {
          query_embedding: qvec,
          ...(args.query ? { p_query_text: args.query.slice(0, 80) } : {}),
          p_rank_category: args.category ?? null,
          p_rank_subcategory: args.subcategory ?? null,
          p_rank_genres: args.genres?.length ? args.genres : null,
          p_filter_category: null,
          p_filter_subcategory: null,
          p_area_id: args.area_id ?? null,
          ...(dateFrom ? { p_date_from: dateFrom } : {}),
          ...(dateTo ? { p_date_to: dateTo } : {}),
          p_neighborhood: args.neighborhood ?? null,
          p_venue: args.venue ?? null,
          p_family: args.family_friendly ?? false,
          p_outdoor: args.outdoor ?? false,
          p_free: args.free_entry ?? false,
          p_max_price_cents: args.max_price_cents ?? null,
          p_lat: args.lat ?? selectedArea?.centroid_lat ?? null,
          p_lng: args.lng ?? selectedArea?.centroid_lng ?? null,
          ...(args.radius_km != null ? { p_radius_km: args.radius_km } : {}),
          p_limit: RETRIEVAL_BREADTH,
        };
        const matchStep = await step("match-events", { type: "retriever", input: rpcArgs },
          () => supabaseAnon.rpc("match_events_v2", rpcArgs));
        const matchMs = matchStep.ms;
        const error = matchStep.value.error;
        const rows = ((matchStep.value.data ?? []) as Row[]);

        const areaAsked = !!args.area_id;
        const eligible = priceEligible(rows, args.max_price_cents != null);
        const groups = partition(eligible, { areaAsked });
        const shown = present(groups, {
          areaAsked,
          areaName: selectedArea?.name ?? args.area_id ?? null,
          show: args.limit ?? 5,
        });

        log.push({
          tool: "search_events",
          args: { ...args, query: args.query?.slice(0, 60) },
          results: rows.length,
          embed_ms: embedMs,
          match_ms: matchMs,
          ms: Date.now() - t0,
          counts: shown.counts,
          ...(degraded ? { degraded } : {}),
        });
        if (error) return { error: "search failed — apologise briefly and suggest retrying" };
        if (rows.length === 0 && (args.query || args.venue)) {
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
        const shape = (e: Row) => ({
          ...e,
          start_time: berlinTime((e.start_time as string | null) ?? null),
          end_time: berlinTime((e.end_time as string | null) ?? null),
          ...(e.price_unknown ? { price_note: "price unknown — do not state it as within a budget" } : {}),
        });
        return {
          ...(degraded ? { degraded_note: "semantic ranking unavailable; results are filter-only" } : {}),
          // What the code decided, verbatim. The model verbalises it; it does not
          // decide what counts as local or how many exist beyond.
          ...(shown.note ? { note: shown.note } : {}),
          counts: shown.counts,
          events: shown.events.map(shape),
          // Alternatives beyond the answer. OFFER these; do not list them as matches.
          ...(shown.offers.length ? { offers: shown.offers.map(shape) } : {}),
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
