"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Filters from "@/components/Filters";
import EventDetail from "@/components/EventDetail";
import EventList from "@/components/EventList";
import ChatPanel from "@/components/ChatPanel";
import CreateEvent from "@/components/CreateEvent";
import ProfilePage from "@/components/ProfilePage";
import Onboarding from "@/components/Onboarding";
import { Event, TimeFilter } from "@/lib/types";
import type { DateRange } from "@/components/Filters";
import { createClient } from "@/lib/supabase/client";
import { BookmarkStatus, getMyBookmarks } from "@/lib/bookmarks";

const EventMap = dynamic(() => import("@/components/EventMap"), { ssr: false });

type View = "map" | "list" | "profile";

export default function Home() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [highlightedEvent, setHighlightedEvent] = useState<Event | null>(null);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("today");
  const [activeCategories, setActiveCategories] = useState<Set<string>>(
    new Set()
  );
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("map");
  const [chatOpen, setChatOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [chatMentionedEvents, setChatMentionedEvents] = useState<Event[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<Record<string, BookmarkStatus>>({});
  const router = useRouter();

  // Check onboarding status + load bookmarks
  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .single();

      if (data && !data.onboarding_completed) {
        setShowOnboarding(true);
      }

      // Load bookmarks
      const bm = await getMyBookmarks();
      setBookmarks(bm);
    }
    init();
  }, []);

  const handleLogout = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }, [router]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const catParam =
      activeCategories.size > 0
        ? `&categories=${Array.from(activeCategories).join(",")}`
        : "";
    const dateParam =
      timeFilter === "custom" && dateRange
        ? `&from=${dateRange.from}&to=${dateRange.to}`
        : "";
    try {
      const res = await fetch(
        `/api/events?time=${timeFilter}${catParam}${dateParam}`
      );
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
    } catch {
      setEvents([]);
    }
    setLoading(false);
  }, [timeFilter, activeCategories, dateRange]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const filteredEvents = events;

  const handleCategoryToggle = useCallback((cat: string) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }, []);

  const handleSelectEvent = useCallback(
    (event: Event | null) => {
      setSelectedEvent(event);
      setHighlightedEvent(null);
      if (event && view === "list") setView("map");
    },
    [view]
  );

  const handleChatSelectEvent = useCallback((event: Event) => {
    setSelectedEvent(event);
    setHighlightedEvent(null);
  }, []);

  const handleCloseEvent = useCallback(() => {
    setSelectedEvent(null);
  }, []);

  const handleBookmarkChange = useCallback((eventId: string, status: BookmarkStatus) => {
    setBookmarks((prev) => {
      const next = { ...prev };
      if (status) {
        next[eventId] = status;
      } else {
        delete next[eventId];
      }
      return next;
    });
  }, []);

  if (showOnboarding && userId) {
    return (
      <Onboarding
        userId={userId}
        onComplete={() => setShowOnboarding(false)}
      />
    );
  }

  return (
    <main className="relative w-screen h-dvh overflow-hidden bg-[#faf9f6] flex flex-col">
      <div className="flex-1 relative flex flex-col min-h-0">
        {/* Map area */}
        <div
          className={`relative flex-1 ${view === "list" || view === "profile" ? "hidden" : ""}`}
        >
          <EventMap
            events={chatOpen && chatMentionedEvents.length > 0 ? chatMentionedEvents : filteredEvents}
            selectedEvent={selectedEvent}
            highlightedEvent={highlightedEvent}
            onSelectEvent={handleSelectEvent}
          />

          {/* Filters overlay */}
          {view === "map" && !chatOpen && (
            <Filters
              timeFilter={timeFilter}
              activeCategories={activeCategories}
              onTimeChange={setTimeFilter}
              onCategoryToggle={handleCategoryToggle}
              eventCount={filteredEvents.length}
              dateRange={dateRange}
              onDateRange={setDateRange}
            />
          )}

          {/* Loading */}
          {loading && !chatOpen && (
            <div className="absolute top-28 left-1/2 -translate-x-1/2 z-50">
              <div className="bg-white/90 backdrop-blur-sm text-gray-500 text-xs px-3.5 py-2 rounded-full shadow-sm border border-gray-100 font-medium">
                Loading...
              </div>
            </div>
          )}

          {/* Floating action buttons */}
          {view === "map" && !chatOpen && !selectedEvent && !createOpen && (
            <>
              {/* Create event — bottom left */}
              <button
                onClick={() => setCreateOpen(true)}
                className="absolute bottom-6 left-4 z-50 w-14 h-14 rounded-full bg-gray-900 text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
              {/* Ask AI — bottom right */}
              <button
                onClick={() => setChatOpen(true)}
                className="absolute bottom-6 right-4 z-50 w-14 h-14 rounded-full bg-gray-900 text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </button>
            </>
          )}

          {/* Create event panel */}
          {createOpen && (
            <CreateEvent
              onClose={() => setCreateOpen(false)}
              onCreated={fetchEvents}
            />
          )}

          {/* Chat panel — slides up from bottom */}
          {chatOpen && (
            <div className="absolute bottom-0 left-0 right-0 h-[50%] z-50 bg-white rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.1)] flex flex-col">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 shrink-0">
                <h2 className="text-sm font-bold text-gray-900">Ask AI</h2>
                <button
                  onClick={() => {
                    setChatOpen(false);
                    setChatMentionedEvents([]);
                    setHighlightedEvent(null);
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 active:bg-gray-100 transition"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <ChatPanel
                  events={events}
                  onHighlightEvent={setHighlightedEvent}
                  onSelectEvent={handleChatSelectEvent}
                  onMentionedEventsChange={setChatMentionedEvents}
                />
              </div>
            </div>
          )}

          {/* Event detail — map view only */}
          {selectedEvent && view === "map" && !chatOpen && (
            <EventDetail
              event={selectedEvent}
              onClose={handleCloseEvent}
              bookmarkStatus={bookmarks[selectedEvent.id]}
              onBookmarkChange={handleBookmarkChange}
            />
          )}

          {/* Fullscreen event detail — chat mode */}
          {selectedEvent && chatOpen && (
            <div className="absolute inset-0 z-[60] bg-white overflow-y-auto animate-slide-up">
              <div className="sticky top-0 bg-white z-10 flex items-center px-4 py-3 border-b border-gray-100">
                <button
                  onClick={handleCloseEvent}
                  className="text-[13px] font-semibold text-gray-600 active:text-gray-900 transition flex items-center gap-1"
                >
                  <span className="text-lg leading-none">{"\u2039"}</span> Back to chat
                </button>
              </div>
              <EventDetail
                event={selectedEvent}
                onClose={handleCloseEvent}
                embedded
                bookmarkStatus={bookmarks[selectedEvent.id]}
                onBookmarkChange={handleBookmarkChange}
              />
            </div>
          )}
        </div>

        {/* List view */}
        {view === "list" && (
          <div className="flex-1 relative">
            <EventList
              events={filteredEvents}
              onSelectEvent={handleSelectEvent}
              bookmarks={bookmarks}
            />
            <Filters
              timeFilter={timeFilter}
              activeCategories={activeCategories}
              onTimeChange={setTimeFilter}
              onCategoryToggle={handleCategoryToggle}
              eventCount={filteredEvents.length}
              dateRange={dateRange}
              onDateRange={setDateRange}
            />
          </div>
        )}

        {/* Profile view */}
        {view === "profile" && (
          <ProfilePage
            onBack={() => setView("map")}
            onLogout={handleLogout}
          />
        )}

      </div>

      {/* Bottom navigation */}
      <nav className="flex items-center justify-around bg-white border-t border-gray-100 py-1 px-2 safe-bottom shadow-[0_-2px_10px_rgba(0,0,0,0.04)]">
        <button
          onClick={() => {
            setView("map");
            setHighlightedEvent(null);
            setChatMentionedEvents([]);
            setSelectedEvent(null);
          }}
          className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-2xl transition ${
            view === "map" ? "text-gray-900 bg-gray-100" : "text-gray-400"
          }`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
            <line x1="8" y1="2" x2="8" y2="18"/>
            <line x1="16" y1="6" x2="16" y2="22"/>
          </svg>
          <span className="text-[10px] font-semibold">Map</span>
        </button>
        <button
          onClick={() => {
            setView("list");
            setHighlightedEvent(null);
            setChatMentionedEvents([]);
            setSelectedEvent(null);
          }}
          className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-2xl transition ${
            view === "list" ? "text-gray-900 bg-gray-100" : "text-gray-400"
          }`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"/>
            <line x1="8" y1="12" x2="21" y2="12"/>
            <line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/>
            <line x1="3" y1="12" x2="3.01" y2="12"/>
            <line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
          <span className="text-[10px] font-semibold">Events</span>
        </button>
        <button
          onClick={() => setView("profile")}
          className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-2xl transition ${
            view === "profile" ? "text-gray-900 bg-gray-100" : "text-gray-400"
          }`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span className="text-[10px] font-semibold">Profile</span>
        </button>
      </nav>
    </main>
  );
}
