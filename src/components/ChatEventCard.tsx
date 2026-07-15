"use client";

import { Event, CATEGORIES } from "@/lib/types";

interface Props {
  event: Event;
  onClose: () => void;
  onMoreInfo: () => void;
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

/** Compact event card for inline chat use */
export default function ChatEventCard({ event, onClose, onMoreInfo }: Props) {
  const cat = CATEGORIES[event.category] || CATEGORIES.culture;
  const time = `${formatDate(event.start_time)} · ${formatTime(event.start_time)}`;

  return (
    <div className="mx-2 my-1 bg-white rounded-2xl shadow-sm border border-black/5 overflow-hidden animate-slide-up">
      <div className="flex gap-3 p-3">
        {event.image_url ? (
          <img
            src={event.image_url}
            alt={event.title}
            className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div
            className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 select-none"
            style={{ background: cat.color + "20" }}
          >
            {cat.emoji}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span
              className="text-[10px] px-2 py-px rounded-full font-semibold text-white"
              style={{ background: cat.color }}
            >
              {cat.emoji} {cat.label}
            </span>
          </div>
          <h3 className="text-[13px] font-bold text-gray-900 leading-tight truncate">
            {event.title}
          </h3>
          <p className="text-[11px] text-gray-500 truncate">
            {event.venue_name}
          </p>
          <p className="text-[11px] text-gray-400">
            {time}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-300 hover:text-gray-500 self-start text-lg leading-none p-1"
        >
          ×
        </button>
      </div>
      <div className="flex border-t border-gray-50">
        <button
          onClick={onMoreInfo}
          className="flex-1 text-[12px] font-semibold text-gray-900 py-2.5 active:bg-gray-50 transition"
        >
          Full details
        </button>
        {event.source_url && (
          <a
            href={event.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-[12px] font-semibold text-gray-500 py-2.5 text-center border-l border-gray-50 active:bg-gray-50 transition"
          >
            Source ↗
          </a>
        )}
        {event.lat && event.lng && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${event.lat},${event.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-[12px] font-semibold text-gray-500 py-2.5 text-center border-l border-gray-50 active:bg-gray-50 transition"
          >
            Directions ↗
          </a>
        )}
      </div>
    </div>
  );
}
