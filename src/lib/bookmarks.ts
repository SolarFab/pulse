import { createClient } from "@/lib/supabase/client";

export type BookmarkStatus = "interested" | "going" | null;

export async function getMyBookmarks(): Promise<Record<string, BookmarkStatus>> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};

  const { data } = await supabase
    .from("user_events")
    .select("event_id, status")
    .eq("user_id", user.id);

  const map: Record<string, BookmarkStatus> = {};
  data?.forEach((row: { event_id: string; status: string }) => {
    map[row.event_id] = row.status as BookmarkStatus;
  });
  return map;
}

export async function toggleBookmark(
  eventId: string,
  currentStatus: BookmarkStatus,
  newStatus: "interested" | "going"
): Promise<BookmarkStatus> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Same status = remove bookmark
  if (currentStatus === newStatus) {
    await supabase
      .from("user_events")
      .delete()
      .eq("user_id", user.id)
      .eq("event_id", eventId);
    return null;
  }

  // Upsert
  await supabase
    .from("user_events")
    .upsert(
      { user_id: user.id, event_id: eventId, status: newStatus },
      { onConflict: "user_id,event_id" }
    );
  return newStatus;
}

export async function getEventCounts(
  eventIds: string[]
): Promise<Record<string, { going: number; interested: number }>> {
  if (eventIds.length === 0) return {};
  const supabase = createClient();
  const { data } = await supabase
    .from("event_interest_counts")
    .select("event_id, going_count, interested_count")
    .in("event_id", eventIds);

  const map: Record<string, { going: number; interested: number }> = {};
  data?.forEach((row: { event_id: string; going_count: number; interested_count: number }) => {
    map[row.event_id] = {
      going: row.going_count || 0,
      interested: row.interested_count || 0,
    };
  });
  return map;
}
