"use client";

import { useState, useEffect } from "react";
import { Event, CATEGORIES } from "@/lib/types";
import { BookmarkStatus } from "@/lib/bookmarks";
import { createClient } from "@/lib/supabase/client";

type Tab = "all" | "going" | "interested";

interface Props {
  events: Event[];
  onSelectEvent: (event: Event) => void;
  bookmarks?: Record<string, BookmarkStatus>;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export default function EventList({ events, onSelectEvent, bookmarks = {} }: Props) {
  const [tab, setTab] = useState<Tab>("all");
  const [savedEvents, setSavedEvents] = useState<Event[]>([]);
  const [savedBookmarks, setSavedBookmarks] = useState<Record<string, BookmarkStatus>>({});
  const [loadingSaved, setLoadingSaved] = useState(false);

  useEffect(() => {
    if (tab === "all") return;
    async function loadSaved() {
      setLoadingSaved(true);
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadingSaved(false); return; }

      const { data: bms } = await supabase
        .from("user_events")
        .select("event_id, status")
        .eq("user_id", user.id);

      if (!bms || bms.length === 0) {
        setSavedEvents([]);
        setSavedBookmarks({});
        setLoadingSaved(false);
        return;
      }

      const eventIds = bms.map((b: { event_id: string }) => b.event_id);
      const res = await fetch(`/api/events?ids=${eventIds.join(",")}`);
      const eventData: Event[] = await res.json();

      const statusMap: Record<string, BookmarkStatus> = {};
      bms.forEach((b: { event_id: string; status: string }) => {
        statusMap[b.event_id] = b.status as BookmarkStatus;
      });

      setSavedEvents(
        eventData.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      );
      setSavedBookmarks(statusMap);
      setLoadingSaved(false);
    }
    loadSaved();
  }, [tab]);

  const displayEvents = tab === "all"
    ? events
    : savedEvents.filter((e) => savedBookmarks[e.id] === tab);
  const displayBookmarks = tab === "all" ? bookmarks : savedBookmarks;

  return (
    <div className="absolute inset-0 z-30 bg-[#faf9f6] overflow-y-auto pt-40 pb-4 px-3">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-3">
        {([["all", "All"], ["going", "Going"], ["interested", "Interested"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-2 rounded-lg text-[13px] font-semibold transition ${
              tab === key ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab !== "all" && loadingSaved && (
        <p className="text-gray-400 text-sm text-center mt-8">Loading...</p>
      )}

      {displayEvents.length === 0 && !loadingSaved && (
        <div className="text-center mt-12">
          {tab === "all" ? (
            <p className="text-gray-400 text-sm">No events found for this filter.</p>
          ) : (
            <>
              <p className="text-2xl mb-2">{tab === "going" ? "\uD83C\uDFAB" : "\u2B50"}</p>
              <p className="text-gray-400 text-sm">
                {tab === "going"
                  ? "No events marked as going yet"
                  : "No events saved as interested yet"}
              </p>
            </>
          )}
        </div>
      )}

      <div className="space-y-2">
        {displayEvents.map((event) => {
          const cat = CATEGORIES[event.category] || CATEGORIES.social;
          const bm = displayBookmarks[event.id];
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
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-semibold text-gray-900 truncate flex-1">
                    {event.title}
                  </h3>
                  {bm === "going" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium shrink-0">
                      Going
                    </span>
                  )}
                  {bm === "interested" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium shrink-0">
                      {"\u2605"}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {event.venue_name}
                  {event.neighborhood && ` \u00B7 ${event.neighborhood}`}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {!isToday(event.start_time) && `${formatDate(event.start_time)} \u00B7 `}
                  {formatTime(event.start_time)}
                  {event.end_time && ` \u2013 ${formatTime(event.end_time)}`}
                  {event.price && ` \u00B7 ${event.price}`}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
