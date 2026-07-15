"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Filters from "@/components/Filters";
import EventDetail from "@/components/EventDetail";
import EventList from "@/components/EventList";
import ChatPanel from "@/components/ChatPanel";
import CreateEvent from "@/components/CreateEvent";
import ProfilePage from "@/components/ProfilePage";
import Onboarding from "@/components/Onboarding";
import { Event, TimeFilter, CATEGORIES, formatEventTime } from "@/lib/types";
import type { DateRange } from "@/components/Filters";
import { createClient } from "@/lib/supabase/client";
import { BookmarkStatus, getMyBookmarks } from "@/lib/bookmarks";

const EventMap = dynamic(() => import("@/components/EventMap"), { ssr: false });

type View = "map" | "list" | "profile";

function SwipeDownSheet({ onClose, className, children }: { onClose: () => void; className?: string; children: React.ReactNode }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragDelta = useRef(0);
  const isDragging = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    // Only allow drag from the top area (handle bar region, first 40px)
    const rect = sheet.getBoundingClientRect();
    const touchY = e.touches[0].clientY - rect.top;
    if (touchY > 40) return;
    dragStartY.current = e.touches[0].clientY;
    isDragging.current = true;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    if (delta < 0) { dragDelta.current = 0; return; }
    dragDelta.current = delta;
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${delta}px)`;
      sheetRef.current.style.transition = "none";
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (sheetRef.current) {
      if (dragDelta.current > 30) {
        sheetRef.current.style.transition = "transform 0.2s ease-out";
        sheetRef.current.style.transform = "translateY(100%)";
        setTimeout(onClose, 200);
      } else {
        sheetRef.current.style.transition = "transform 0.2s ease-out";
        sheetRef.current.style.transform = "translateY(0)";
      }
    }
    dragDelta.current = 0;
  }, [onClose]);

  return (
    <div
      ref={sheetRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className={`absolute bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.1)] flex flex-col ${className || ""}`}
    >
      {/* Handle bar */}
      <div className="flex justify-center pt-2 pb-1 shrink-0 cursor-grab">
        <div className="w-9 h-1 bg-gray-300 rounded-full" />
      </div>
      {children}
    </div>
  );
}

export default function Home() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [highlightedEvent, setHighlightedEvent] = useState<Event | null>(null);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("today");
  const [activeCategories, setActiveCategories] = useState<Set<string>>(
    new Set()
  );
  const [activeSubtag, setActiveSubtag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("map");
  const [chatOpen, setChatOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [chatMentionedEvents, setChatMentionedEvents] = useState<Event[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<Record<string, BookmarkStatus>>({});
  const [venueEvents, setVenueEvents] = useState<Event[]>([]);
  const [userGenres, setUserGenres] = useState<string[]>([]);
  const [userSubcategories, setUserSubcategories] = useState<Record<string, string[]>>({});
  const [homeLocation, setHomeLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const router = useRouter();

  // Check onboarding status + load bookmarks
  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // Fetch profile and bookmarks in parallel — they don't depend on each other
      const [{ data }, bm] = await Promise.all([
        supabase
          .from("profiles")
          .select("onboarding_completed, genres, subcategories, home_lat, home_lng")
          .eq("id", user.id)
          .single(),
        getMyBookmarks(),
      ]);

      if (data) {
        const forceOnboarding = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("onboarding") === "true";
        if (!data.onboarding_completed || forceOnboarding) {
          setShowOnboarding(true);
        }
        setUserGenres(data.genres || []);
        setUserSubcategories(data.subcategories || {});
        if (data.home_lat && data.home_lng) {
          setHomeLocation({ lat: data.home_lat, lng: data.home_lng });
        }
      }

      setBookmarks(bm);
    }
    init();
  }, []);

  // Request browser geolocation
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}, // silently ignore denial
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }, []);

  const requestLocation = useCallback((): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCurrentLocation(loc);
          resolve(loc);
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }, []);

  const handleLogout = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }, [router]);

  // Session-lived cache per filter combination: cached results render
  // instantly (stale-while-revalidate), and pins stay on screen during
  // refetches instead of blanking.
  const eventsCache = useRef<Map<string, Event[]>>(new Map());

  const fetchEvents = useCallback(async () => {
    const catParam =
      activeCategories.size > 0
        ? `&categories=${Array.from(activeCategories).join(",")}`
        : "";
    const dateParam =
      timeFilter === "custom" && dateRange
        ? `&from=${dateRange.from}&to=${dateRange.to}`
        : "";
    const tagParam = activeSubtag ? `&tag=${activeSubtag}` : "";
    const url = `/api/events?time=${timeFilter}${catParam}${dateParam}${tagParam}`;

    const cached = eventsCache.current.get(url);
    if (cached) {
      setEvents(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data)) {
        eventsCache.current.set(url, data);
        setEvents(data);
      } else if (!cached) {
        setEvents([]);
      }
    } catch {
      if (!cached) setEvents([]);
    }
    setLoading(false);
  }, [timeFilter, activeCategories, dateRange, activeSubtag]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const filteredEvents = events;

  const handleCategoryToggle = useCallback((cat: string) => {
    setActiveSubtag(null);
    setActiveCategories((prev) => {
      // If this category is already the only active one, deselect it (show all)
      if (prev.size === 1 && prev.has(cat)) {
        return new Set<string>();
      }
      // Otherwise select only this category
      return new Set([cat]);
    });
  }, []);

  const handleSubtagSelect = useCallback((category: string, tag: string | null) => {
    // When selecting a subtag, ensure only that category is active
    setActiveCategories(new Set([category]));
    setActiveSubtag(tag);
  }, []);

  const handleSelectEvent = useCallback(
    (event: Event | null) => {
      setSelectedEvent(event);
      setVenueEvents([]);
      setHighlightedEvent(null);
      if (event) setView("map");
    },
    []
  );

  const handleSelectVenueEvents = useCallback(
    (evts: Event[]) => {
      setVenueEvents(evts.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()));
      setSelectedEvent(null);
      setHighlightedEvent(null);
    },
    []
  );

  const handleChatSelectEvent = useCallback((event: Event) => {
    setSelectedEvent(event);
    setHighlightedEvent(null);
  }, []);

  const handleCloseEvent = useCallback(() => {
    setSelectedEvent(null);
    setVenueEvents([]);
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
        onComplete={async () => {
          setShowOnboarding(false);
          // Reload preferences after onboarding
          const supabase = createClient();
          const { data } = await supabase
            .from("profiles")
            .select("genres, subcategories, home_lat, home_lng")
            .eq("id", userId)
            .single();
          if (data) {
            setUserGenres(data.genres || []);
            setUserSubcategories(data.subcategories || {});
            if (data.home_lat && data.home_lng) {
              setHomeLocation({ lat: data.home_lat, lng: data.home_lng });
            }
          }
        }}
      />
    );
  }

  return (
    <div className="w-screen h-dvh bg-[#f2f0ea] md:flex md:items-center md:justify-center">
      {/* Desktop-only brand outside the phone frame */}
      <div className="hidden md:flex items-center gap-2 fixed top-5 left-6 z-10 select-none">
        <span className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-violet-500 to-rose-400 flex items-center justify-center text-[15px] shadow-sm">
          {"🌙"}
        </span>
        <span className="text-lg font-extrabold tracking-tight text-gray-900">
          NachtKarte
        </span>
      </div>

      {/* On mobile: true fullscreen app. On md+: centered phone-style frame.
          transform-gpu creates a containing block so fixed-position overlays
          anchor to the frame instead of the whole viewport. */}
      <main className="relative w-screen h-dvh overflow-hidden bg-[#faf9f6] flex flex-col md:w-[420px] md:h-[min(92dvh,880px)] md:rounded-[2.25rem] md:border md:border-black/10 md:shadow-[0_30px_80px_-20px_rgba(26,26,26,0.4)] md:transform-gpu">
      <div className="flex-1 relative flex flex-col min-h-0">
        {/* Map area */}
        <div
          className={`relative flex-1 ${view === "profile" ? "hidden" : ""}`}
        >
          <EventMap
            events={chatOpen && chatMentionedEvents.length > 0 ? chatMentionedEvents : filteredEvents}
            selectedEvent={selectedEvent}
            highlightedEvent={highlightedEvent}
            onSelectEvent={handleSelectEvent}
            onSelectVenueEvents={handleSelectVenueEvents}
            homeLocation={homeLocation}
          />

          {/* Filters overlay */}
          {view === "map" && !chatOpen && (
            <Filters
              timeFilter={timeFilter}
              activeCategories={activeCategories}
              onTimeChange={setTimeFilter}
              onCategoryToggle={handleCategoryToggle}
              activeSubtag={activeSubtag}
              onSubtagSelect={handleSubtagSelect}
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
            <SwipeDownSheet onClose={() => setCreateOpen(false)} className="h-full">
              <CreateEvent
                onClose={() => setCreateOpen(false)}
                onCreated={fetchEvents}
              />
            </SwipeDownSheet>
          )}

          {/* Chat panel — slides up from bottom */}
          {chatOpen && (
            <SwipeDownSheet onClose={() => { setChatOpen(false); setChatMentionedEvents([]); setHighlightedEvent(null); }} className="h-[50%]">
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
                  homeLocation={homeLocation}
                  currentLocation={currentLocation}
                  onRequestLocation={requestLocation}
                />
              </div>
            </SwipeDownSheet>
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

          {/* Venue events panel — multiple events at same location */}
          {venueEvents.length > 0 && !selectedEvent && view === "map" && !chatOpen && (
            <div className="absolute bottom-0 left-0 right-0 z-50 animate-slide-up safe-bottom">
              <div className="fixed inset-0 z-40" onClick={handleCloseEvent} />
              <div className="relative z-50 bg-white rounded-t-3xl max-h-[65dvh] overflow-y-auto overscroll-contain shadow-[0_-4px_30px_rgba(0,0,0,0.1)]">
                <div className="sticky top-0 bg-white flex justify-center pt-3 pb-2 z-10">
                  <div className="w-9 h-1 bg-gray-300 rounded-full" />
                </div>
                <div className="px-4 pb-2">
                  <h2 className="text-sm font-bold text-gray-900 mb-0.5">
                    {venueEvents[0].venue_name}
                  </h2>
                  <p className="text-xs text-gray-400 mb-3">
                    {venueEvents.length} events at this venue
                  </p>
                </div>
                <div className="px-3 pb-5 space-y-2">
                  {venueEvents.map((event) => {
                    const cat = CATEGORIES[event.category] || CATEGORIES.culture;
                    return (
                      <button
                        key={event.id}
                        onClick={() => {
                          setSelectedEvent(event);
                        }}
                        className="w-full text-left bg-gray-50 rounded-2xl p-3.5 active:bg-gray-100 transition flex gap-3 border border-gray-100"
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
                          <p className="text-xs text-gray-500">
                            {new Date(event.start_time).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" })}
                            {" · "}
                            {formatEventTime(event)}
                          </p>
                          {event.price && (
                            <p className="text-xs text-gray-400 mt-0.5">{event.price}</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Fullscreen event detail — chat mode */}
          {selectedEvent && chatOpen && (
            <div className="absolute inset-0 z-[60] bg-white overflow-y-auto animate-slide-up">
              <div className="sticky top-0 bg-white z-10 flex items-center px-4 py-3 border-b border-gray-100">
                <button
                  onClick={handleCloseEvent}
                  className="text-[13px] font-semibold text-gray-600 active:text-gray-900 transition flex items-center gap-1"
                >
                  <span className="text-lg leading-none">{"‹"}</span> Back to chat
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

          {/* Events list — bottom sheet overlay on map */}
          {view === "list" && (
            <SwipeDownSheet onClose={() => setView("map")} className="h-[85%]">
              <div className="flex-1 min-h-0 overflow-hidden relative">
                <EventList
                  events={filteredEvents}
                  onSelectEvent={handleSelectEvent}
                  bookmarks={bookmarks}
                  userGenres={userGenres}
                  userSubcategories={userSubcategories}
                  homeLocation={homeLocation}
                />
                <Filters
                  timeFilter={timeFilter}
                  activeCategories={activeCategories}
                  onTimeChange={setTimeFilter}
                  onCategoryToggle={handleCategoryToggle}
                  activeSubtag={activeSubtag}
                  onSubtagSelect={handleSubtagSelect}
                  eventCount={filteredEvents.length}
                  dateRange={dateRange}
                  onDateRange={setDateRange}
                />
              </div>
            </SwipeDownSheet>
          )}
        </div>


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
          onClick={() => (userId ? setView("profile") : router.push("/login"))}
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
    </div>
  );
}
