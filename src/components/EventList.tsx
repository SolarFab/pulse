"use client";

import { Event, CATEGORIES } from "@/lib/types";

interface Props {
  events: Event[];
  onSelectEvent: (event: Event) => void;
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

export default function EventList({ events, onSelectEvent }: Props) {
  return (
    <div className="absolute inset-0 z-30 bg-[#faf9f6] overflow-y-auto pt-28 pb-4 px-3">
      {events.length === 0 && (
        <p className="text-gray-400 text-sm text-center mt-12">
          No events found for this filter.
        </p>
      )}
      <div className="space-y-2">
        {events.map((event) => {
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
                  {event.neighborhood && ` \u00B7 ${event.neighborhood}`}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {!isToday(event.start_time) && `${formatDate(event.start_time)} · `}
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
