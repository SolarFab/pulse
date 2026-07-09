import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/admin";

// Helper: get current time in Berlin and build ISO strings for filtering
function berlinNow(): Date {
  // Get the current UTC time, then figure out Berlin offset
  const now = new Date();
  // Format in Berlin timezone to extract components
  const berlinStr = now.toLocaleString("sv-SE", { timeZone: "Europe/Berlin" });
  // "sv-SE" gives us "YYYY-MM-DD HH:MM:SS" format
  return new Date(berlinStr.replace(" ", "T") + "+01:00");
}

function berlinDate(year: number, month: number, day: number, hours = 0, minutes = 0, seconds = 0): string {
  // Build a Berlin-local datetime and return as ISO string
  // CET is UTC+1, CEST is UTC+2 — for simplicity use the offset from the runtime
  const pad = (n: number) => n.toString().padStart(2, "0");
  const localStr = `${year}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  // Create date as if it were UTC, then adjust
  // Actually, the cleanest way: use Intl to find the current Berlin offset
  const d = new Date(`${localStr}+01:00`); // CET baseline
  return d.toISOString();
}

function getBerlinComponents(): { year: number; month: number; day: number; hours: number; dayOfWeek: number; nowISO: string } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });

  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";

  const year = parseInt(get("year"));
  const month = parseInt(get("month"));
  const day = parseInt(get("day"));
  const hours = parseInt(get("hour"));
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayOfWeek = dayNames.indexOf(get("weekday"));

  return { year, month, day, hours, dayOfWeek, nowISO: now.toISOString() };
}

function makeBerlinISO(year: number, month: number, day: number, h: number, m: number, s: number): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  // Determine Berlin UTC offset: CEST (+02:00) from last Sunday of March to last Sunday of October
  const lastSunday = (m: number, y: number) => {
    const d = new Date(y, m, 0); // last day of month
    return d.getDate() - d.getDay();
  };
  const dstStart = new Date(year, 2, lastSunday(3, year), 2, 0, 0); // March last Sunday 2am
  const dstEnd = new Date(year, 9, lastSunday(10, year), 3, 0, 0);  // October last Sunday 3am
  const target = new Date(year, month - 1, day, h, m, s);
  const offset = target >= dstStart && target < dstEnd ? "+02:00" : "+01:00";
  return `${year}-${pad(month)}-${pad(day)}T${pad(h)}:${pad(m)}:${pad(s)}${offset}`;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const ids = params.get("ids");

  // Fetch specific events by IDs (used by chat to resolve AI-mentioned events)
  if (ids) {
    const idList = ids.split(",").filter(Boolean);
    const { data, error } = await supabase
      .from("events_with_coords")
      .select("id,title,venue_name,lat,lng,neighborhood,address,start_time,end_time,category,subcategory,tags,description,price,image_url,source,source_url")
      .eq("status", "active")
      .eq("is_active", true)
      .in("id", idList);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const resp = NextResponse.json(data || []);
    resp.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    return resp;
  }

  const timeFilter = params.get("time") || "today";
  const categories = params.get("categories");
  const tag = params.get("tag"); // subtag filter (e.g., "jazz")
  const dateFrom = params.get("from"); // YYYY-MM-DD
  const dateTo = params.get("to"); // YYYY-MM-DD

  const berlin = getBerlinComponents();
  const { year, month, day, dayOfWeek, nowISO } = berlin;

  let startFilter: string;
  let endFilter: string;

  switch (timeFilter) {
    case "now": {
      startFilter = nowISO;
      endFilter = nowISO;
      break;
    }
    case "2hours": {
      startFilter = nowISO;
      endFilter = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      break;
    }
    case "tonight": {
      // Now until 6 AM tomorrow Berlin time
      startFilter = nowISO;
      const tmrwDay = new Date(year, month - 1, day + 1);
      endFilter = makeBerlinISO(tmrwDay.getFullYear(), tmrwDay.getMonth() + 1, tmrwDay.getDate(), 6, 0, 0);
      break;
    }
    case "tomorrow": {
      const tmrw = new Date(year, month - 1, day + 1);
      const y = tmrw.getFullYear(), m = tmrw.getMonth() + 1, d = tmrw.getDate();
      startFilter = makeBerlinISO(y, m, d, 0, 0, 0);
      endFilter = makeBerlinISO(y, m, d, 23, 59, 59);
      break;
    }
    case "weekend": {
      const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
      const fri = new Date(year, month - 1, day + daysUntilFriday);
      const sun = new Date(fri.getFullYear(), fri.getMonth(), fri.getDate() + 2);
      const friISO = makeBerlinISO(fri.getFullYear(), fri.getMonth() + 1, fri.getDate(), 17, 0, 0);
      const sunISO = makeBerlinISO(sun.getFullYear(), sun.getMonth() + 1, sun.getDate(), 23, 59, 59);
      startFilter = nowISO > friISO ? nowISO : friISO;
      endFilter = sunISO;
      break;
    }
    case "custom": {
      if (dateFrom) {
        const [fy, fm, fd] = dateFrom.split("-").map(Number);
        startFilter = makeBerlinISO(fy, fm, fd, 0, 0, 0);
        if (dateTo) {
          const [ty, tm, td] = dateTo.split("-").map(Number);
          endFilter = makeBerlinISO(ty, tm, td, 23, 59, 59);
        } else {
          endFilter = makeBerlinISO(fy, fm, fd, 23, 59, 59);
        }
      } else {
        startFilter = makeBerlinISO(year, month, day, 0, 0, 0);
        endFilter = makeBerlinISO(year, month, day, 23, 59, 59);
      }
      break;
    }
    default: {
      // "today" in Berlin time
      startFilter = makeBerlinISO(year, month, day, 0, 0, 0);
      endFilter = makeBerlinISO(year, month, day, 23, 59, 59);
      break;
    }
  }

  // Trimmed payload: map pins and list rows only need these fields.
  // Full records (description, tags, image, links) load on demand via ?ids=.
  const selectCols = "id,title,venue_name,lat,lng,neighborhood,start_time,end_time,category,subcategory,price,source";

  const now = new Date();
  const windowStart = new Date(startFilter);

  // Query 1: Events starting within the time window
  let q1 = supabase
    .from("events_with_coords")
    .select(selectCols)
    .eq("status", "active")
    .eq("is_active", true)
    .gte("start_time", startFilter)
    .lte("start_time", endFilter);

  // Query 2: Ongoing events — started before the window but end_time extends into it
  // Limit lookback: 48h for short windows (overnight clubs), 7 days for weekend/custom
  // (multi-day festivals). Never pull in months-old exhibitions.
  const isShortWindow = ["now", "2hours", "tonight", "tomorrow", "today"].includes(timeFilter);
  const lookbackMs = isShortWindow ? 48 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  const ongoingCutoff = new Date(windowStart.getTime() - lookbackMs).toISOString();
  let q2 = supabase
    .from("events_with_coords")
    .select(selectCols)
    .eq("status", "active")
    .eq("is_active", true)
    .lt("start_time", startFilter)
    .gte("start_time", ongoingCutoff)
    .gte("end_time", startFilter);

  if (categories) {
    q1 = q1.in("category", categories.split(","));
    q2 = q2.in("category", categories.split(","));
  }

  if (tag) {
    // Filter by subcategory column (e.g., "jazz-blues", "electronic")
    q1 = q1.eq("subcategory", tag);
    q2 = q2.eq("subcategory", tag);
  }

  q1 = q1.order("start_time", { ascending: true }).limit(1000);
  q2 = q2.order("start_time", { ascending: true }).limit(200);

  const [res1, res2] = await Promise.all([q1, q2]);
  const error = res1.error || res2.error;

  // Merge and deduplicate by id
  const seen = new Set<string>();
  const rawData: typeof res1.data = [];
  for (const e of [...(res1.data || []), ...(res2.data || [])]) {
    if (!seen.has(e.id)) {
      seen.add(e.id);
      rawData.push(e);
    }
  }

  // Post-filter: remove events that have already ended
  const data = rawData.filter((e) => {
    const start = new Date(e.start_time);
    if (e.end_time) {
      const end = new Date(e.end_time);
      if (end < now) return false;
      return true;
    } else {
      // No end_time: assume max 18h duration, skip if assumed end has passed
      const assumedEnd = new Date(start.getTime() + 18 * 60 * 60 * 1000);
      if (assumedEnd < now) return false;
      return true;
    }
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const response = NextResponse.json(data || []);
  // Events only change once/day (4am scrape) — cache for 5min, serve stale while revalidating
  response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  return response;
}
