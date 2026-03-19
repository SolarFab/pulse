import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase/admin";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are Whatsupp, a warm and opinionated Berlin event concierge. You know the city inside out — the underground spots, the tourist traps to avoid, and where the real magic happens on any given night.

RULES:
- Recommend 3-5 events per response. Show VARIETY — spread across different venues, don't just pick from one place.
- Be specific and opinionated — explain WHY each pick is worth it.
- Keep it concise: 2-3 sentences per recommendation max.
- Add insider tips when relevant ("arrive before 22:00 to skip the line", "grab a Spezi at the Späti across the street first").
- If nothing matches perfectly, suggest the closest alternative.
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
      .from("events")
      .select("id,title,venue_name,neighborhood,address,start_time,end_time,category,subcategory,description,price,tags,source,lat,lng")
      .lte("start_time", endFilter)
      .or(`end_time.gte.${startFilter},end_time.is.null,start_time.gte.${startFilter}`)
      .or(`venue_name.ilike.%${escapedQ}%,title.ilike.%${escapedQ}%,address.ilike.%${escapedQ}%,neighborhood.ilike.%${escapedQ}%,description.ilike.%${escapedQ}%`)
      .order("start_time", { ascending: true })
      .limit(30);

    const { data: tData } = await textSearchQuery;
    textResults = tData || [];
  }

  // Also try individual significant words for venue/neighborhood matching
  const significantWords = words.filter((w) => w.length > 3);
  if (significantWords.length > 1 && textResults.length === 0) {
    for (const word of significantWords) {
      const escapedW = word.replace(/[%_]/g, "");
      const { data: wData } = await supabase
        .from("events")
        .select("id,title,venue_name,neighborhood,address,start_time,end_time,category,subcategory,description,price,tags,source,lat,lng")
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

  // Category-based query
  let query = supabase
    .from("events")
    .select("id,title,venue_name,neighborhood,address,start_time,end_time,category,subcategory,description,price,tags,source,lat,lng")
    .lte("start_time", endFilter)
    .or(`end_time.gte.${startFilter},end_time.is.null,start_time.gte.${startFilter}`);

  if (matchedCategories.length > 0) {
    query = query.in("category", matchedCategories);
  }

  query = query.order("start_time", { ascending: true }).limit(100);

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

  return results.slice(0, 100)
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
      return `[${e.id}] "${e.title}" @ ${e.venue_name} (${e.neighborhood || "Berlin"})${nearbyTag} | ${time}${endStr} | ${e.category}${e.subcategory ? "/" + e.subcategory : ""} | ${e.price || "Price unknown"}${distStr} | ${e.description || "No description"}${e.tags?.length ? " | Tags: " + e.tags.join(", ") : ""}`;
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

export async function POST(req: NextRequest) {
  const { messages, homeLocation } = await req.json();

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response("messages required", { status: 400 });
  }

  const lastUserMsg = messages.filter((m: { role: string }) => m.role === "user").pop();
  const userMsg = lastUserMsg?.content || "";
  const isNearbyQuery = /\b(my neighborhood|my area|near me|around me|um mich|meine gegend|meiner gegend|meiner nähe|in der nähe|bei mir|um die ecke|nearby|mein kiez|meinem kiez)\b/i.test(userMsg);

  const eventsContext = await fetchRelevantEvents(userMsg, isNearbyQuery && homeLocation ? homeLocation : null);

  const berlinTime = new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin", weekday: "long", hour: "2-digit", minute: "2-digit", day: "numeric", month: "long", year: "numeric" });

  let locationContext = "";
  if (homeLocation) {
    locationContext = `\nThe user lives at coordinates (${homeLocation.lat.toFixed(4)}, ${homeLocation.lng.toFixed(4)}) in Berlin. When they ask about "my neighborhood", "near me", "bei mir", "meine Gegend", "mein Kiez", etc., prioritize events close to this location. Events marked with [NEARBY] are within 3km of the user's home.\n`;
  }

  const systemPrompt = SYSTEM_PROMPT + `\nCurrent time in Berlin: ${berlinTime}${locationContext}\nIMPORTANT: When the user asks about "right now" or "jetzt", only recommend events that have already started or start within the next 30 minutes. Do NOT recommend events starting hours later.\n\n` + eventsContext;

  const stream = anthropic.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
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
