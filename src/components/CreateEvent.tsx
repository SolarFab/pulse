"use client";

import { useState } from "react";
import { CATEGORIES } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateEvent({ onClose, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [venueName, setVenueName] = useState("");
  const [address, setAddress] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [category, setCategory] = useState("social");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!title.trim() || !venueName.trim() || !date || !startTime) {
      setError("Please fill in title, venue, date and start time.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("You must be logged in.");
        setSubmitting(false);
        return;
      }

      const startISO = `${date}T${startTime}:00`;
      const endISO = endTime ? `${date}T${endTime}:00` : null;

      // If end time is before start time, assume next day
      let finalEndISO = endISO;
      if (endISO && endISO < startISO) {
        const nextDay = new Date(new Date(date).getTime() + 86400000);
        const nextDateStr = nextDay.toISOString().split("T")[0];
        finalEndISO = `${nextDateStr}T${endTime}:00`;
      }

      // Geocode the address
      let lat: number | null = null;
      let lng: number | null = null;
      if (address.trim()) {
        try {
          const geoRes = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address + ", Berlin")}&format=json&limit=1`
          );
          const geoData = await geoRes.json();
          if (geoData[0]) {
            lat = parseFloat(geoData[0].lat);
            lng = parseFloat(geoData[0].lon);
          }
        } catch {
          // Geocoding failed, continue without coords
        }
      }

      const { error: insertError } = await supabase.from("events").insert({
        title: title.trim(),
        venue_name: venueName.trim(),
        address: address.trim() || null,
        start_time: startISO,
        end_time: finalEndISO,
        category,
        description: description.trim() || null,
        price: price.trim() || null,
        lat,
        lng,
        source: "user",
        source_id: `user_${user.id}_${Date.now()}`,
        created_by: user.id,
      });

      if (insertError) {
        setError(insertError.message);
        setSubmitting(false);
        return;
      }

      onCreated();
      onClose();
    } catch (e) {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="absolute inset-0 z-[70] bg-white overflow-y-auto animate-slide-up">
      {/* Header */}
      <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button
          onClick={onClose}
          className="text-[13px] font-semibold text-gray-600 active:text-gray-900 transition"
        >
          Cancel
        </button>
        <h2 className="text-[15px] font-bold text-gray-900">Create Event</h2>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="text-[13px] font-semibold text-white bg-gray-900 px-4 py-1.5 rounded-full active:bg-gray-700 transition disabled:opacity-50"
        >
          {submitting ? "..." : "Post"}
        </button>
      </div>

      <div className="max-w-sm mx-auto px-4 py-5 space-y-4">
        {error && (
          <p className="text-red-500 text-xs bg-red-50 px-3 py-2 rounded-xl">{error}</p>
        )}

        {/* Title */}
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Event title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Rooftop Jazz Night"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-black/10"
          />
        </div>

        {/* Venue */}
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Venue *</label>
          <input
            type="text"
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
            placeholder="e.g. Klunkerkranich"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-black/10"
          />
        </div>

        {/* Address */}
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Address</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="e.g. Karl-Marx-Str. 66"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-black/10"
          />
        </div>

        {/* Date + Time row */}
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Date & time *</label>
          <div className="flex gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="flex-1 px-3 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
            />
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-24 px-3 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
            />
            <span className="self-center text-gray-400 text-sm">{"\u2013"}</span>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              placeholder="End"
              className="w-24 px-3 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
            />
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="text-xs font-medium text-gray-500 mb-2 block">Category</label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CATEGORIES).map(([key, cat]) => (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(key)}
                className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition border ${
                  category === key
                    ? "text-white border-transparent"
                    : "bg-white text-gray-500 border-gray-200"
                }`}
                style={category === key ? { backgroundColor: cat.color } : {}}
              >
                {cat.emoji} {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Price */}
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Price</label>
          <input
            type="text"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="e.g. Free, 10\u20AC, 15-20\u20AC"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-black/10"
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tell people what to expect..."
            rows={3}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-black/10 resize-none"
          />
        </div>
      </div>
    </div>
  );
}
