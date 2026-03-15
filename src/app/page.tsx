"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Filters from "@/components/Filters";
import EventDetail from "@/components/EventDetail";
import EventList from "@/components/EventList";
import ChatPanel from "@/components/ChatPanel";
import ProfilePage from "@/components/ProfilePage";
import Onboarding from "@/components/Onboarding";
import { Event, TimeFilter } from "@/lib/types";
import type { DateRange } from "@/components/Filters";
import { createClient } from "@/lib/supabase/client";

const EventMap = dynamic(() => import("@/components/EventMap"), { ssr: false });

type View = "map" | "list" | "chat" | "profile";

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
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [chatMentionedEvents, setChatMentionedEvents] = useState<Event[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const router = useRouter();

  // Check onboarding status
  useEffect(() => {
    async function checkOnboarding() {
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
    }
    checkOnboarding();
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
          className={`relative transition-all duration-300 ${
            view === "chat" ? "h-[55%]" : "flex-1"
          } ${view === "list" || view === "profile" ? "hidden" : ""}`}
        >
          <EventMap
            events={view === "chat" && chatMentionedEvents.length > 0 ? chatMentionedEvents : events}
            selectedEvent={selectedEvent}
            highlightedEvent={highlightedEvent}
            onSelectEvent={handleSelectEvent}
          />

          {/* Filters overlay */}
          {view === "map" && (
            <Filters
              timeFilter={timeFilter}
              activeCategories={activeCategories}
              onTimeChange={setTimeFilter}
              onCategoryToggle={handleCategoryToggle}
              eventCount={events.length}
              dateRange={dateRange}
              onDateRange={setDateRange}
            />
          )}

          {/* Loading */}
          {loading && view !== "chat" && (
            <div className="absolute top-28 left-1/2 -translate-x-1/2 z-50">
              <div className="bg-white/90 backdrop-blur-sm text-gray-500 text-xs px-3.5 py-2 rounded-full shadow-sm border border-gray-100 font-medium">
                Loading...
              </div>
            </div>
          )}

          {/* Event detail — map view only */}
          {selectedEvent && view === "map" && (
            <EventDetail
              event={selectedEvent}
              onClose={handleCloseEvent}
            />
          )}
        </div>

        {/* List view */}
        {view === "list" && (
          <div className="flex-1 relative">
            <EventList events={events} onSelectEvent={handleSelectEvent} />
            <Filters
              timeFilter={timeFilter}
              activeCategories={activeCategories}
              onTimeChange={setTimeFilter}
              onCategoryToggle={handleCategoryToggle}
              eventCount={events.length}
              dateRange={dateRange}
              onDateRange={setDateRange}
            />
          </div>
        )}

        {/* Chat panel — bottom 45% */}
        {view === "chat" && (
          <div className="h-[45%] z-40">
            <ChatPanel
              events={events}
              onHighlightEvent={setHighlightedEvent}
              onSelectEvent={handleChatSelectEvent}
              onMentionedEventsChange={setChatMentionedEvents}
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

        {/* Fullscreen event detail — chat mode */}
        {selectedEvent && view === "chat" && (
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
            />
          </div>
        )}
      </div>

      {/* Bottom navigation */}
      <nav className="flex items-center justify-around bg-white border-t border-gray-100 py-1 px-4 safe-bottom shadow-[0_-2px_10px_rgba(0,0,0,0.04)]">
        <button
          onClick={() => {
            setView("map");
            setHighlightedEvent(null);
            setChatMentionedEvents([]);
            setSelectedEvent(null);
          }}
          className={`flex flex-col items-center gap-1 px-6 py-2.5 rounded-2xl transition ${
            view === "map" ? "text-gray-900 bg-gray-100" : "text-gray-400"
          }`}
        >
          <span className="text-2xl">&#x1F5FA;&#xFE0F;</span>
          <span className="text-[11px] font-semibold">Map</span>
        </button>
        <button
          onClick={() => {
            setView("list");
            setHighlightedEvent(null);
            setChatMentionedEvents([]);
            setSelectedEvent(null);
          }}
          className={`flex flex-col items-center gap-1 px-6 py-2.5 rounded-2xl transition ${
            view === "list" ? "text-gray-900 bg-gray-100" : "text-gray-400"
          }`}
        >
          <span className="text-2xl">&#x1F4CB;</span>
          <span className="text-[11px] font-semibold">Events</span>
        </button>
        <button
          onClick={() => setView("chat")}
          className={`flex flex-col items-center gap-1 px-6 py-2.5 rounded-2xl transition ${
            view === "chat" ? "text-gray-900 bg-gray-100" : "text-gray-400"
          }`}
        >
          <span className="text-2xl">&#x2728;</span>
          <span className="text-[11px] font-semibold">Ask AI</span>
        </button>
        <button
          onClick={() => setView("profile")}
          className={`flex flex-col items-center gap-1 px-6 py-2.5 rounded-2xl transition ${
            view === "profile" ? "text-gray-900 bg-gray-100" : "text-gray-400"
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span className="text-[11px] font-semibold">Profile</span>
        </button>
      </nav>
    </main>
  );
}
