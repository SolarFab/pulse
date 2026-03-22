import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase/admin";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EXTRACTION_PROMPT = `You are an expert at reading event flyers, posters, and promotional materials. Extract event information from this image.

Return a JSON object with these fields (use null for anything you can't determine):
{
  "title": "Event title",
  "venue_name": "Venue or location name",
  "address": "Street address if visible",
  "neighborhood": "Berlin neighborhood if identifiable",
  "start_date": "YYYY-MM-DD",
  "start_time": "HH:MM (24h format)",
  "end_time": "HH:MM (24h format) or null",
  "category": "one of: music, nightlife, culture, food, markets, workshops, meetups, outdoors, family",
  "subcategory": "more specific type, e.g. jazz-blues, club-night, exhibition",
  "description": "Brief description of the event (1-2 sentences)",
  "price": "e.g. Free, €12, from €8",
  "tags": ["relevant", "tags"]
}

IMPORTANT:
- The current year is 2026. If no year is shown, assume 2026.
- If a day of the week is shown but no date, calculate the next occurrence from today (2026-03-22).
- For Berlin venues, try to identify the neighborhood from the address or venue name.
- category MUST be one of: music, nightlife, culture, food, markets, workshops, meetups, outdoors, family
- Return ONLY valid JSON, no markdown or explanation.`;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // Convert to base64
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const mediaType = file.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

    // Send to Claude Vision
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            { type: "text", text: EXTRACTION_PROMPT },
          ],
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    // Parse JSON from response (handle potential markdown wrapping)
    const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const extracted = JSON.parse(jsonStr);

    return NextResponse.json({ extracted });
  } catch (err) {
    console.error("Scan error:", err);
    return NextResponse.json(
      { error: "Failed to process image" },
      { status: 500 }
    );
  }
}

// Save a confirmed scanned event to the database
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, venue_name, address, neighborhood, start_time, end_time, category, subcategory, description, price, tags } = body;

    if (!title || !venue_name || !start_time || !category) {
      return NextResponse.json(
        { error: "title, venue_name, start_time, and category are required" },
        { status: 400 }
      );
    }

    // Build fingerprint for dedup
    const dateStr = start_time.slice(0, 10);
    const fingerprint = `${title.toLowerCase().trim()}|${venue_name.toLowerCase().trim()}|${dateStr}`;

    // Check for duplicate
    const { data: existing } = await supabase
      .from("events")
      .select("id")
      .eq("fingerprint", fingerprint)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "This event already exists", id: existing.id },
        { status: 409 }
      );
    }

    // Look up venue for coords
    const { data: venue } = await supabase
      .from("venues")
      .select("id, lat, lng, neighborhood, address")
      .ilike("name", venue_name.trim())
      .maybeSingle();

    const { data: inserted, error } = await supabase
      .from("events")
      .insert({
        title: title.trim(),
        venue_name: venue_name.trim(),
        venue_id: venue?.id || null,
        address: address || venue?.address || null,
        neighborhood: neighborhood || venue?.neighborhood || null,
        lat: venue?.lat || null,
        lng: venue?.lng || null,
        start_time,
        end_time: end_time || null,
        category,
        subcategory: subcategory || null,
        description: description || null,
        price: price || null,
        tags: tags || null,
        source: "community-scan",
        status: "active",
        fingerprint,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: inserted.id, venue_matched: !!venue });
  } catch (err) {
    console.error("Save error:", err);
    return NextResponse.json({ error: "Failed to save event" }, { status: 500 });
  }
}
