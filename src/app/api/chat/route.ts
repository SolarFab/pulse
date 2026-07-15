import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase/admin";
import { createClient as createAuthClient } from "@/lib/supabase/server";

// Dedicated concierge key (separate spend limit from the pipeline's
// classification key); falls back to the shared key if not set.
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY_CONCIERGE || process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are Pulse, a warm and opinionated Berlin event concierge. You know the city inside out — the underground spots, the tourist traps to avoid, and where the real magic happens on any given night.

RULES:
- ONLY recommend events that appear in the EVENTS DATABASE below. Every recommendation MUST be one of those entries, cited with its exact [EVENT_ID]. NEVER invent, remember or assume events, venues, dates, times or prices that are not in the list — not even famous ones you think you know.
- If the database has no good match for the request, say so honestly and suggest the closest alternative FROM THE LIST, or propose a different time window or category. Do NOT fall back to general Berlin knowledge for recommendations.
- Recommend 3-5 events per response. Show VARIETY — spread across different venues, don't just pick from one place.
- Be specific and opinionated — explain WHY each pick is worth it, based on the information in the entry.
- Keep it concise: 2-3 sentences per recommendation max.
- Insider tips are welcome but must be generic (timing, transport, neighborhood vibe) — never invented facts about the specific event or venue.
- Respond in the same language the user writes in (German or English).
- IMPORTANT: Prioritize smaller/unique venues alongside well-known ones. A hidden gem at a neighborhood bar is more interesting than the obvious pick.
- IMPORTANT: Each event in the database has an ID in brackets like [abc123]. You MUST include this ID when recommending events.
- Format each recommendation like:
  **Event Title** @ Venue Name [EVENT_ID]
  Time · Category
  Your recommendation text.
  Where EVENT_ID is the exact ID from the database entry.

EVENTS DATABASE (current events):
`;

async function fetchRelevantEvents(userMessage: string, homeLocation: { lat: number; lng: number } | null): Promise<string> {
  const msg = userMessage.toLowerCase();

  // Determine time window from message
  const now = new Date();
  let startFilter: string;
  let endFilter: string;

  if (msg.includes("now") || msg.includes("jetzt") || msg.includes("right now") || msg.includes("gerade")) {
    startFilter = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    endFilter = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
  } else if (msg.includes("tonight") || msg.includes("heute abend") || msg.includes("heute nacht") || msg.includes("today") || msg.includes("heute")) {
    // Tonight: now until 6 AM tomorrow
    const tonight6am = new Date(now);
    tonight6am.setDate(tonight6am.getDate() + 1);
    tonight6am.setHours(6, 0, 0, 0);
    startFilter = now.toISOString();
    endFilter = tonight6am.toISOString();
  } else if (msg.includes("tomorrow") || msg.includes("morgen")) {
    const tmrw = new Date(now);
    tmrw.setDate(tmrw.getDate() + 1);
    tmrw.setHours(0, 0, 0, 0);
    const tmrwEnd = new Date(tmrw);
    tmrwEnd.setHours(23, 59, 59, 999);
    startFilter = tmrw.toISOString();
    endFilter = tmrwEnd.toISOString();
  } else if (msg.includes("weekend") || msg.includes("wochenende")) {
    const day = now.getDay();
    const daysUntilFriday = (5 - day + 7) % 7;
    const friday = new Date(now);
    friday.setDate(friday.getDate() + (daysUntilFriday === 0 && now.getHours() >= 17 ? 0 : daysUntilFriday));
    friday.setHours(17, 0, 0, 0);
    const sunday = new Date(friday);
    sunday.setDate(sunday.getDate() + 2);
    sunday.setHours(23, 59, 59, 999);
    startFilter = now > friday ? now.toISOString() : friday.toISOString();
    endFilter = sunday.toISOString();
  } else {
    // Default (no time keyword): next 7 days
    const next7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    startFilter = now.toISOString();
    endFilter = next7d.toISOString();
  }

  // Determine category filter from message
  const categoryKeywords: Record<string, string[]> = {
    music: ["music", "musik", "concert", "konzert", "live", "band"],
    nightlife: ["club", "techno", "party", "rave", "dj", "dance", "tanzen", "nightlife"],
    culture: ["art", "kunst", "gallery", "galerie", "museum", "exhibition", "ausstellung", "culture", "kultur", "theater", "theatre", "kabarett", "kino", "film", "movie", "comedy"],
    food: ["food", "essen", "restaurant", "street food", "beer", "bier", "brunch"],
    markets: ["market", "markt", "flohmarkt", "flea", "trödelmarkt"],
    workshops: ["workshop", "kurs", "class", "craft", "basteln"],
    meetups: ["meetup", "social", "friends", "freunde", "chill", "hang", "networking"],
    outdoors: ["outdoor", "park", "yoga", "sport", "fitness", "bike", "walking tour", "draußen"],
    family: ["kids", "kinder", "family", "familie", "children", "child", "playground", "spielplatz", "kindertheater"],
  };

  // Genre-specific keywords that map to a parent category
  const genreToCategory: Record<string, string> = {
    jazz: "music", blues: "music", soul: "music", funk: "music",
    rock: "music", punk: "music", metal: "music", classical: "music", klassik: "music",
    "hip hop": "music", hiphop: "music", rap: "music",
    techno: "nightlife", house: "nightlife", electronic: "nightlife",
    "drum and bass": "nightlife", dnb: "nightlife", trance: "nightlife",
    reggae: "music", ska: "music", latin: "music", salsa: "music",
  };

  const matchedCategories: string[] = [];
  for (const [cat, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some((kw) => msg.includes(kw))) {
      matchedCategories.push(cat);
    }
  }

  // Also match genre keywords to their parent category
  for (const [genre, cat] of Object.entries(genreToCategory)) {
    if (msg.includes(genre) && !matchedCategories.includes(cat)) {
      matchedCategories.push(cat);
    }
  }

  // Extract potential venue/location names from the message
  // Remove common filler words and time keywords to isolate search terms
  const stopWords = new Set([
    "what", "whats", "what's", "is", "are", "was", "at", "in", "on", "the", "a", "an",
    "happening", "going", "events", "event", "today", "tonight", "tomorrow", "weekend",
    "now", "right", "please", "list", "show", "me", "some", "find", "search", "for",
    "best", "good", "nice", "cool", "fun", "any", "do", "does", "can", "you", "i",
    "want", "looking", "like", "near", "around", "this", "next", "week", "there",
    "was", "gibt", "es", "und", "oder", "mir", "bitte", "zeig", "finde", "suche",
    "heute", "morgen", "jetzt", "gerade", "abend", "nacht", "wochenende",
    ...Object.values(categoryKeywords).flat(),
    ...Object.keys(genreToCategory),
  ]);

  const words = msg.split(/\s+/).filter((w) => w.length > 2 && !stopWords.has(w));
  const textQuery = words.join(" ").trim();

  // If we have a text query, do a separate search by venue/title/address/neighborhood
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let textResults: any[] = [];
  if (textQuery.length > 2) {
    const escapedQ = textQuery.replace(/[%_]/g, "");
    const textSearchQuery = supabase
      .from("events_with_coords")
      .select("id,title,venue_name,neighborhood,address,start_time,end_time,category,subcategory,description,price,tags,source,lat,lng")
      .eq("status", "active")
      .eq("is_active", true)
      .lte("start_time", endFilter)
      .or(`end_time.gte.${startFilter},end_time.is.null,start_time.gte.${startFilter}`)
      .or(`venue_name.ilike.%${escapedQ}%,title.ilike.%${escapedQ}%,address.ilike.%${escapedQ}%,neighborhood.ilike.%${escapedQ}%,description.ilike.%${escapedQ}%`)
      .order("start_time", { ascending: true })
      .limit(30);

    const { data: tData } = await textSearchQuery;
    textResults = tData || [];

    // Secondary search: if text search found 0 results within time window,
    // look for upcoming events at this venue without time filter
    if (textResults.length === 0) {
      const { data: upcomingData } = await supabase
        .from("events_with_coords")
        .select("id,title,venue_name,neighborhood,address,start_time,end_time,category,subcategory,description,price,tags,source,lat,lng")
      .eq("status", "active")
      .eq("is_active", true)
        .gt("start_time", new Date().toISOString())
        .or(`venue_name.ilike.%${escapedQ}%,title.ilike.%${escapedQ}%`)
        .order("start_time", { ascending: true })
        .limit(5);
      if (upcomingData && upcomingData.length > 0) {
        textResults = upcomingData.map((e) => ({ ...e, _upcoming: true }));
      }
    }
  }

  // Also try individual significant words for venue/neighborhood matching
  const significantWords = words.filter((w) => w.length > 3);
  if (significantWords.length > 1 && textResults.length === 0) {
    for (const word of significantWords) {
      const escapedW = word.replace(/[%_]/g, "");
      const { data: wData } = await supabase
        .from("events_with_coords")
        .select("id,title,venue_name,neighborhood,address,start_time,end_time,category,subcategory,description,price,tags,source,lat,lng")
      .eq("status", "active")
      .eq("is_active", true)
        .lte("start_time", endFilter)
        .or(`end_time.gte.${startFilter},end_time.is.null,start_time.gte.${startFilter}`)
        .or(`venue_name.ilike.%${escapedW}%,address.ilike.%${escapedW}%,neighborhood.ilike.%${escapedW}%`)
        .order("start_time", { ascending: true })
        .limit(20);
      if (wData && wData.length > 0) {
        textResults = [...textResults, ...wData.filter((e) => !textResults.some((t) => t.id === e.id))];
      }
    }
  }

  // Category-based query — keep the context lean: 60 candidates max
  let query = supabase
    .from("events_with_coords")
    .select("id,title,venue_name,neighborhood,address,start_time,end_time,category,subcategory,description,price,tags,source,lat,lng")
      .eq("status", "active")
      .eq("is_active", true)
    .lte("start_time", endFilter)
    .or(`end_time.gte.${startFilter},end_time.is.null,start_time.gte.${startFilter}`);

  if (matchedCategories.length > 0) {
    query = query.in("category", matchedCategories);
  }

  query = query.order("start_time", { ascending: true }).limit(60);

  const { data } = await query;

  // Merge text results (prioritized) with category results
  const seen = new Set<string>();
  const merged: typeof data = [];

  // Text search results first (most relevant for venue/location queries)
  for (const e of textResults) {
    if (!seen.has(e.id)) {
      seen.add(e.id);
      merged.push(e);
    }
  }
  // Then category results
  for (const e of (data || [])) {
    if (!seen.has(e.id)) {
      seen.add(e.id);
      merged.push(e);
    }
  }

  if (merged.length === 0) return "No events found for this time period.";

  // If nearby query with home location, sort by distance
  let results = merged;
  if (homeLocation) {
    const withDist = merged.map((e) => ({
      event: e,
      dist: e.lat && e.lng ? distanceKm(homeLocation.lat, homeLocation.lng, e.lat, e.lng) : 999,
    }));
    withDist.sort((a, b) => a.dist - b.dist);
    results = withDist.map((w) => w.event);
  }

  // 40 events × ~150-char descriptions keeps prompt cost low without
  // hurting recommendation quality (the model only ever cites 3-5).
  return results.slice(0, 40)
    .map((e) => {
      const time = new Date(e.start_time).toLocaleString("de-DE", {
        timeZone: "Europe/Berlin",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        day: "numeric",
        month: "short",
      });
      const endStr = e.end_time
        ? ` – ${new Date(e.end_time).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" })}`
        : "";
      const dist = homeLocation && e.lat && e.lng ? distanceKm(homeLocation.lat, homeLocation.lng, e.lat, e.lng) : null;
      const nearbyTag = dist !== null && dist < 3 ? " [NEARBY]" : "";
      const distStr = dist !== null ? ` | ${dist < 1 ? Math.round(dist * 1000) + "m" : dist.toFixed(1) + "km"} away` : "";
      const upcomingTag = (e as { _upcoming?: boolean })._upcoming ? "UPCOMING (outside requested time window): " : "";
      // Truncate descriptions — full text multiplies prompt tokens without
      // improving recommendations
      const desc = (e.description || "No description").slice(0, 150);
      return `[${e.id}] ${upcomingTag}"${e.title}" @ ${e.venue_name} (${e.neighborhood || "Berlin"})${nearbyTag} | ${time}${endStr} | ${e.category}${e.subcategory ? "/" + e.subcategory : ""} | ${e.price || "Price unknown"}${distStr} | ${desc}`;
    })
    .join("\n");
}

// Haversine distance in km
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Simple in-memory rate limit: max 20 requests per IP per minute
const rateLimit = new Map<string, { count: number; reset: number }>();

export async function POST(req: NextRequest) {
  // The concierge requires a signed-in user — every request costs API money.
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return new Response("Sign in to use the concierge", { status: 401 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const entry = rateLimit.get(ip);
  if (entry && now < entry.reset) {
    entry.count++;
    if (entry.count > 20) {
      return new Response("Too many requests", { status: 429 });
    }
  } else {
    rateLimit.set(ip, { count: 1, reset: now + 60_000 });
  }

  const { messages, homeLocation, currentLocation } = await req.json();

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response("messages required", { status: 400 });
  }

  const lastUserMsg = messages.filter((m: { role: string }) => m.role === "user").pop();
  const userMsg = lastUserMsg?.content || "";
  const isNeighborhoodQuery = /\b(my neighborhood|my hood|meine gegend|meiner gegend|mein kiez|meinem kiez|bei mir zuhause|bei mir daheim)\b/i.test(userMsg);
  const isAroundMeQuery = /\b(around me|near me|um mich|in der nähe|in meiner nähe|bei mir|um die ecke|nearby|hier)\b/i.test(userMsg);

  // "my neighborhood" → home pin, "around me" → GPS, fallback to home
  const locationForQuery = isAroundMeQuery
    ? (currentLocation || homeLocation || null)
    : isNeighborhoodQuery
      ? (homeLocation || null)
      : null;

  const eventsContext = await fetchRelevantEvents(userMsg, locationForQuery);

  const berlinTime = new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin", weekday: "long", hour: "2-digit", minute: "2-digit", day: "numeric", month: "long", year: "numeric" });

  let locationContext = "";
  if (homeLocation) {
    locationContext += `\nThe user's HOME neighborhood is at (${homeLocation.lat.toFixed(4)}, ${homeLocation.lng.toFixed(4)}). Use this for \"my neighborhood\"/\"mein Kiez\"/\"meine Gegend\" queries.\n`;
  }
  if (currentLocation) {
    locationContext += `The user's CURRENT GPS location is (${currentLocation.lat.toFixed(4)}, ${currentLocation.lng.toFixed(4)}). Use this for \"around me\"/\"near me\"/\"in der Nähe\" queries.\n`;
  }
  if (locationContext) {
    locationContext += `Events marked [NEARBY] are within 3km. Include distance in your recommendations when relevant.\n`;
  }

  const systemPrompt = SYSTEM_PROMPT + `\nCurrent time in Berlin: ${berlinTime}${locationContext}\nIMPORTANT: When the user asks about \"right now\" or \"jetzt\", only recommend events that have already started or start within the next 30 minutes. Do NOT recommend events starting hours later.\n\n` + eventsContext;

  const stream = anthropic.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 700,
    system: systemPrompt,
    messages: messages.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  });

  // Stream response using Server-Sent Events
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
          );
        }
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
