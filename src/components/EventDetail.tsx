"use client";

import { useState, useEffect } from "react";
import { Event, CATEGORIES } from "@/lib/types";
import { BookmarkStatus, toggleBookmark, getEventCounts } from "@/lib/bookmarks";

interface Props {
  event: Event;
  onClose: () => void;
  embedded?: boolean;
  bookmarkStatus?: BookmarkStatus;
  onBookmarkChange?: (eventId: string, status: BookmarkStatus) => void;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function isBeforeToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() < now.getFullYear() ||
    d.getMonth() < now.getMonth() ||
    (d.getMonth() === now.getMonth() && d.getDate() < now.getDate())
  );
}

function smartDateLabel(startTime: string, endTime: string | null): string {
  const startIsOld = isBeforeToday(startTime);
  const time = formatTime(startTime);
  const endStr = endTime ? ` \u2013 ${formatTime(endTime)}` : "";

  if (startIsOld && endTime) {
    const endDate = new Date(endTime);
    const now = new Date();
    const isEndToday =
      endDate.getFullYear() === now.getFullYear() &&
      endDate.getMonth() === now.getMonth() &&
      endDate.getDate() === now.getDate();
    if (isEndToday) return `Open today \u00B7 ${time}${endStr}`;
    return `Ongoing \u00B7 until ${formatDate(endTime)} \u00B7 ${time}${endStr}`;
  }

  if (startIsOld) return `Open today \u00B7 ${time}`;
  return `${formatDate(startTime)} \u00B7 ${time}${endStr}`;
}

function EventContent({
  event,
  cat,
  bookmarkStatus,
  onBookmarkChange,
}: {
  event: Event;
  cat: { emoji: string; color: string; label: string };
  bookmarkStatus?: BookmarkStatus;
  onBookmarkChange?: (eventId: string, status: BookmarkStatus) => void;
}) {
  const [bmStatus, setBmStatus] = useState<BookmarkStatus>(bookmarkStatus || null);
  const [counts, setCounts] = useState<{ going: number; interested: number }>({ going: 0, interested: 0 });
  const [showCalPicker, setShowCalPicker] = useState(false);

  useEffect(() => {
    setBmStatus(bookmarkStatus || null);
  }, [bookmarkStatus]);

  useEffect(() => {
    getEventCounts([event.id]).then((c) => {
      if (c[event.id]) setCounts(c[event.id]);
    });
  }, [event.id]);

  async function handleBookmark(status: "interested" | "going") {
    const newStatus = await toggleBookmark(event.id, bmStatus, status);
    setBmStatus(newStatus);
    onBookmarkChange?.(event.id, newStatus);
    // Update counts optimistically
    setCounts((prev) => {
      const next = { ...prev };
      if (bmStatus === "going") next.going = Math.max(0, next.going - 1);
      if (bmStatus === "interested") next.interested = Math.max(0, next.interested - 1);
      if (newStatus === "going") next.going += 1;
      if (newStatus === "interested") next.interested += 1;
      return next;
    });
  }

  function calendarData(evt: Event) {
    const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const start = fmt(evt.start_time);
    const end = evt.end_time ? fmt(evt.end_time) : fmt(new Date(new Date(evt.start_time).getTime() + 2 * 3600000).toISOString());
    const location = [evt.venue_name, evt.address].filter(Boolean).join(", ");
    const desc = evt.source_url ? `${(evt.description || "").slice(0, 300)}\n\n${evt.source_url}` : (evt.description || "").slice(0, 300);
    return { start, end, location, desc };
  }

  function openGoogleCalendar(evt: Event) {
    const { start, end, location, desc } = calendarData(evt);
    const params = new URLSearchParams({ action: "TEMPLATE", text: evt.title, dates: `${start}/${end}`, location, details: desc });
    window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, "_blank");
  }

  function openOutlookCalendar(evt: Event) {
    const { location, desc } = calendarData(evt);
    const startISO = new Date(evt.start_time).toISOString();
    const endISO = evt.end_time ? new Date(evt.end_time).toISOString() : new Date(new Date(evt.start_time).getTime() + 2 * 3600000).toISOString();
    const params = new URLSearchParams({ path: "/calendar/action/compose", rru: "addevent", subject: evt.title, startdt: startISO, enddt: endISO, location, body: desc });
    window.open(`https://outlook.live.com/calendar/0/action/compose?${params.toString()}`, "_blank");
  }

  function buildICS(evt: Event): string {
    const { start, end, location, desc } = calendarData(evt);
    return [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Whatsupp//Event//EN", "BEGIN:VEVENT",
      `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${evt.title}`, `LOCATION:${location}`,
      `DESCRIPTION:${desc.replace(/\n/g, "\\n")}`, evt.source_url ? `URL:${evt.source_url}` : "",
      `UID:${evt.id}@whatsupp.app`, "END:VEVENT", "END:VCALENDAR",
    ].filter(Boolean).join("\r\n");
  }

  function openAppleCalendar(evt: Event) {
    const ics = buildICS(evt);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    // Open as a link (not download) — triggers native calendar prompt on iOS/macOS
    window.open(url, "_self");
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function downloadICS(evt: Event) {
    const ics = buildICS(evt);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${evt.title.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40)}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleShare() {
    const text = `${event.title} @ ${event.venue_name}\n${formatDate(event.start_time)} ${formatTime(event.start_time)}`;
    const shareData: ShareData = {
      title: event.title,
      text,
      url: event.source_url || undefined,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(`${text}\n${event.source_url || ""}`);
    }
  }

  const totalInterest = counts.going + counts.interested;

  return (
    <>
      {/* Category + price badges */}
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold text-white"
          style={{ background: cat.color }}
        >
          {cat.emoji} {cat.label}
        </span>
        {event.price && (
          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
            {event.price}
          </span>
        )}
        {totalInterest > 0 && (
          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-violet-50 text-violet-600 font-medium">
            {totalInterest} {totalInterest === 1 ? "person" : "people"} interested
          </span>
        )}
      </div>

      <h2 className="text-lg font-bold text-gray-900 mb-0.5 leading-snug">
        {event.title}
      </h2>

      <p className="text-[13px] text-gray-500 mb-0.5">
        {event.venue_name}
        {event.neighborhood && ` \u00B7 ${event.neighborhood}`}
      </p>

      <p className="text-[13px] text-gray-600 mb-3 font-medium">
        {smartDateLabel(event.start_time, event.end_time)}
      </p>

      {/* Bookmark + Calendar + Share actions */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => handleBookmark("interested")}
          className={`flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition flex items-center justify-center gap-1.5 ${
            bmStatus === "interested"
              ? "bg-amber-500 text-white"
              : "bg-gray-100 text-gray-600 active:bg-gray-200"
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={bmStatus === "interested" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          {bmStatus === "interested" ? "Saved!" : "Interested"}
        </button>
        <div className="flex-1 relative">
          <button
            onClick={() => setShowCalPicker(!showCalPicker)}
            className="w-full py-2.5 rounded-xl text-[13px] font-semibold transition flex items-center justify-center gap-1.5 bg-gray-100 text-gray-600 active:bg-gray-200"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
              <line x1="12" y1="14" x2="12" y2="18"/>
              <line x1="10" y1="16" x2="14" y2="16"/>
            </svg>
            Calendar
          </button>
          {showCalPicker && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-10">
              <button onClick={() => { openGoogleCalendar(event); setShowCalPicker(false); }} className="w-full text-left px-3.5 py-2.5 text-[13px] text-gray-700 hover:bg-gray-50 active:bg-gray-100 flex items-center gap-2.5 font-medium">
                <span className="text-base">G</span> Google Calendar
              </button>
              <button onClick={() => { openOutlookCalendar(event); setShowCalPicker(false); }} className="w-full text-left px-3.5 py-2.5 text-[13px] text-gray-700 hover:bg-gray-50 active:bg-gray-100 flex items-center gap-2.5 font-medium border-t border-gray-50">
                <span className="text-base">O</span> Outlook
              </button>
              <button onClick={() => { openAppleCalendar(event); setShowCalPicker(false); }} className="w-full text-left px-3.5 py-2.5 text-[13px] text-gray-700 hover:bg-gray-50 active:bg-gray-100 flex items-center gap-2.5 font-medium border-t border-gray-50">
                <span className="text-base">&#63743;</span> Apple Calendar
              </button>
<button onClick={() => { downloadICS(event); setShowCalPicker(false); }} className="w-full text-left px-3.5 py-2.5 text-[13px] text-gray-700 hover:bg-gray-50 active:bg-gray-100 flex items-center gap-2.5 font-medium border-t border-gray-50">
                <span className="text-base">+</span> Other (.ics)
              </button>
            </div>
          )}
        </div>
        <button
          onClick={handleShare}
          className="py-2.5 px-4 rounded-xl bg-gray-100 text-gray-600 active:bg-gray-200 transition"
          aria-label="Share"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
            <polyline points="16 6 12 2 8 6"/>
            <line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
        </button>
      </div>

      {event.image_url && (
        <div className="mb-3 rounded-2xl overflow-hidden">
          <img
            src={event.image_url}
            alt={event.title}
            className="w-full h-36 object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}

      {event.description && (
        <p className="text-[13px] text-gray-500 mb-3 leading-relaxed">
          {event.description}
        </p>
      )}

      {event.address && (
        <p className="text-[11px] text-gray-400 mb-3">{event.address}</p>
      )}

      {event.tags && event.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {event.tags.map((tag) => (
            <span
              key={tag}
              className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {event.source_url && (
          <a
            href={event.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center text-[13px] py-3.5 rounded-2xl bg-gray-900 text-white font-semibold active:bg-gray-700 transition shadow-sm"
          >
            {event.source === "resident_advisor" ? "View on RA" : "More Info"}
          </a>
        )}
        {event.lat && event.lng && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${event.lat},${event.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] py-3.5 px-5 rounded-2xl bg-gray-100 text-gray-700 font-semibold active:bg-gray-200 transition"
          >
            Directions
          </a>
        )}
      </div>

      <p className="text-[10px] text-gray-400 mt-2.5 text-center">
        via {event.source.replace(/_/g, " ")}
      </p>
    </>
  );
}

export default function EventDetail({ event, onClose, embedded, bookmarkStatus, onBookmarkChange }: Props) {
  const cat = CATEGORIES[event.category] || CATEGORIES.social;

  if (embedded) {
    return (
      <div className="px-4 pb-5">
        <EventContent event={event} cat={cat} bookmarkStatus={bookmarkStatus} onBookmarkChange={onBookmarkChange} />
      </div>
    );
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 z-50 animate-slide-up safe-bottom">
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div className="relative z-50 bg-white rounded-t-3xl max-h-[65dvh] overflow-y-auto overscroll-contain shadow-[0_-4px_30px_rgba(0,0,0,0.1)]">
        <div className="sticky top-0 bg-white flex justify-center pt-3 pb-2 z-10">
          <div className="w-9 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="px-4 pb-5">
          <EventContent event={event} cat={cat} bookmarkStatus={bookmarkStatus} onBookmarkChange={onBookmarkChange} />
        </div>
      </div>
    </div>
  );
}
