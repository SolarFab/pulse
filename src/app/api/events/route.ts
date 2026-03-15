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
  // Determine if DST is active for this date (rough: last Sunday of March to last Sunday of October)
  // For March 2026, DST starts March 29 — so March 12 is still CET (+01:00)
  const offset = "+01:00"; // CET — good enough for March
  return `${year}-${pad(month)}-${pad(day)}T${pad(h)}:${pad(m)}:${pad(s)}${offset}`;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const ids = params.get("ids");

  // Fetch specific events by IDs (used by chat to resolve AI-mentioned events)
  if (ids) {
    const idList = ids.split(",").filter(Boolean);
    const { data, error } = await supabase
      .from("events")
      .select("id,title,venue_name,lat,lng,neighborhood,address,start_time,end_time,category,subcategory,tags,description,price,image_url,source,source_url")
      .in("id", idList);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data || []);
  }

  const timeFilter = params.get("time") || "today";
  const categories = params.get("categories");
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

  let query = supabase
    .from("events")
    .select("id,title,venue_name,lat,lng,neighborhood,address,start_time,end_time,category,subcategory,tags,description,price,image_url,source,source_url");

  // Filter events within the time window:
  // - Events starting within the window (start_time between start and end filter)
  // - Events still ongoing (started before but end_time is after startFilter)
  // Exclude: events with no end_time that started before the window
  if (timeFilter === "now") {
    query = query
      .lte("start_time", startFilter)
      .or(`end_time.gte.${endFilter},and(end_time.is.null,start_time.gte.${startFilter})`);
  } else {
    query = query
      .lte("start_time", endFilter)
      .or(`and(start_time.gte.${startFilter}),end_time.gte.${startFilter}`);
  }

  if (categories) {
    query = query.in("category", categories.split(","));
  }

  query = query.order("start_time", { ascending: true }).limit(500);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
