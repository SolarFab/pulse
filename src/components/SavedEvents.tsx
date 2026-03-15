"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Event, CATEGORIES } from "@/lib/types";
import { BookmarkStatus } from "@/lib/bookmarks";

interface Props {
  onSelectEvent: (event: Event) => void;
  onBack: () => void;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

interface SavedEvent extends Event {
  bookmark_status: BookmarkStatus;
}

export default function SavedEvents({ onSelectEvent, onBack }: Props) {
  const [events, setEvents] = useState<SavedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"going" | "interested">("going");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: bookmarks } = await supabase
        .from("user_events")
        .select("event_id, status")
        .eq("user_id", user.id);

      if (!bookmarks || bookmarks.length === 0) {
        setLoading(false);
        return;
      }

      const eventIds = bookmarks.map((b: { event_id: string }) => b.event_id);
      const res = await fetch(`/api/events?ids=${eventIds.join(",")}`);
      const eventData: Event[] = await res.json();

      const statusMap: Record<string, string> = {};
      bookmarks.forEach((b: { event_id: string; status: string }) => {
        statusMap[b.event_id] = b.status;
      });

      const saved: SavedEvent[] = eventData
        .map((e) => ({ ...e, bookmark_status: (statusMap[e.id] || null) as BookmarkStatus }))
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

      setEvents(saved);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = events.filter((e) => e.bookmark_status === tab);

  return (
    <div className="flex-1 overflow-y-auto bg-[#faf9f6]">
      <div className="max-w-sm mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={onBack}
            className="text-sm font-semibold text-gray-600 active:text-gray-900"
          >
            {"\u2039"} Back
          </button>
          <h1 className="text-lg font-bold">My Events</h1>
          <div className="w-12" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5">
          <button
            onClick={() => setTab("going")}
            className={`flex-1 py-2 rounded-lg text-[13px] font-semibold transition ${
              tab === "going" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
            }`}
          >
            Going ({events.filter((e) => e.bookmark_status === "going").length})
          </button>
          <button
            onClick={() => setTab("interested")}
            className={`flex-1 py-2 rounded-lg text-[13px] font-semibold transition ${
              tab === "interested" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
            }`}
          >
            Interested ({events.filter((e) => e.bookmark_status === "interested").length})
          </button>
        </div>

        {loading && (
          <p className="text-gray-400 text-sm text-center mt-8">Loading...</p>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center mt-12">
            <p className="text-2xl mb-2">{tab === "going" ? "\uD83C\uDFAB" : "\u2B50"}</p>
            <p className="text-gray-400 text-sm">
              {tab === "going"
                ? "No events marked as going yet"
                : "No events saved as interested yet"}
            </p>
          </div>
        )}

        <div className="space-y-2">
          {filtered.map((event) => {
            const cat = CATEGORIES[event.category] || CATEGORIES.social;
            return (
              <button
                key={event.id}
                onClick={() => onSelectEvent(event)}
                className="w-full text-left bg-white rounded-2xl p-3.5 active:bg-gray-50 transition flex gap-3 border border-gray-100 shadow-sm"
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-lg shrink-0"
                  style={{ background: cat.color + "20" }}
                >
                  {cat.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">
                    {event.title}
                  </h3>
                  <p className="text-xs text-gray-500 truncate">
                    {event.venue_name}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatDate(event.start_time)} {"\u00B7"} {formatTime(event.start_time)}
                    {event.price && ` \u00B7 ${event.price}`}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
