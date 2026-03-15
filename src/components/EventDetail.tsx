"use client";

import { Event, CATEGORIES } from "@/lib/types";

interface Props {
  event: Event;
  onClose: () => void;
  /** When true, renders content only (no absolute positioning, no backdrop) */
  embedded?: boolean;
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
    if (isEndToday) {
      return `Open today \u00B7 ${time}${endStr}`;
    }
    const untilStr = formatDate(endTime);
    return `Ongoing \u00B7 until ${untilStr} \u00B7 ${time}${endStr}`;
  }

  if (startIsOld) {
    return `Open today \u00B7 ${time}`;
  }

  return `${formatDate(startTime)} \u00B7 ${time}${endStr}`;
}

function EventContent({ event, cat }: { event: Event; cat: { emoji: string; color: string; label: string } }) {
  return (
    <>
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

      <div className="flex gap-2">
        {event.source_url && (
          <a
            href={event.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center text-[13px] py-3.5 rounded-2xl bg-gray-900 text-white font-semibold active:bg-gray-700 transition shadow-sm"
          >
            More Info
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

export default function EventDetail({ event, onClose, embedded }: Props) {
  const cat = CATEGORIES[event.category] || CATEGORIES.social;

  if (embedded) {
    return (
      <div className="px-4 pb-5">
        <EventContent event={event} cat={cat} />
      </div>
    );
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 z-50 animate-slide-up safe-bottom">
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div className="relative z-50 bg-white rounded-t-3xl max-h-[55dvh] overflow-y-auto overscroll-contain shadow-[0_-4px_30px_rgba(0,0,0,0.1)]">
        <div className="sticky top-0 bg-white flex justify-center pt-3 pb-2 z-10">
          <div className="w-9 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="px-4 pb-5">
          <EventContent event={event} cat={cat} />
        </div>
      </div>
    </div>
  );
}
