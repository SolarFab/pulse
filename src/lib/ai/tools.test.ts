import { beforeAll, describe, expect, it } from "vitest";

// Schema-level tests (semantic-search 2.4): validation rules, no network/DB.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon";

let searchSchema: { safeParse: (v: unknown) => { success: boolean } };

beforeAll(async () => {
  const { buildTools } = await import("./tools");
  const tools = buildTools({
    categories: ["music", "nightlife", "markets"],
    subcategories: ["jazz-blues", "flea-market"],
    log: [],
  });
  searchSchema = tools.search_events.inputSchema as typeof searchSchema;
});

describe("search_events schema", () => {
  it("accepts an empty call (all params optional)", () => {
    expect(searchSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a full hybrid call", () => {
    expect(
      searchSchema.safeParse({
        query: "jazz",
        subcategory: "jazz-blues",
        date_from: "2026-07-30T17:00:00+02:00",
        date_to: "2026-07-31T05:00:00+02:00",
        family_friendly: true,
        lat: 52.474,
        lng: 13.428,
        radius_km: 1,
        limit: 10,
      }).success
    ).toBe(true);
  });

  it("rejects lat without lng (geo pair rule)", () => {
    expect(searchSchema.safeParse({ lat: 52.5 }).success).toBe(false);
  });

  it("rejects unknown category (enum generated from taxonomy)", () => {
    expect(searchSchema.safeParse({ category: "sportsball" }).success).toBe(false);
    expect(searchSchema.safeParse({ category: "markets" }).success).toBe(true);
  });

  it("rejects out-of-range radius and limit", () => {
    expect(searchSchema.safeParse({ lat: 52.5, lng: 13.4, radius_km: 50 }).success).toBe(false);
    expect(searchSchema.safeParse({ limit: 100 }).success).toBe(false);
  });

  it("rejects coordinates outside Berlin", () => {
    expect(searchSchema.safeParse({ lat: 48.13, lng: 11.58 }).success).toBe(false); // Munich
  });
});
