"use client";

import { useState, useRef } from "react";
import { CATEGORIES } from "@/lib/types";

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

interface ExtractedEvent {
  title: string | null;
  venue_name: string | null;
  address: string | null;
  neighborhood: string | null;
  start_date: string | null;
  start_time: string | null;
  end_time: string | null;
  category: string | null;
  subcategory: string | null;
  description: string | null;
  price: string | null;
  tags: string[] | null;
}

type Step = "capture" | "scanning" | "review" | "saving" | "done" | "error";

export default function ScanFlyer({ onClose, onSaved }: Props) {
  const [step, setStep] = useState<Step>("capture");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [extracted, setExtracted] = useState<ExtractedEvent | null>(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Editable fields for review
  const [title, setTitle] = useState("");
  const [venueName, setVenueName] = useState("");
  const [address, setAddress] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");

  function handleFileSelect(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleScan() {
    if (!imageFile) return;
    setStep("scanning");
    setError("");

    try {
      const formData = new FormData();
      formData.append("image", imageFile);

      const res = await fetch("/api/events/scan", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Scan failed");
      }

      const { extracted: data } = await res.json();
      setExtracted(data);

      // Populate editable fields
      setTitle(data.title || "");
      setVenueName(data.venue_name || "");
      setAddress(data.address || "");
      setStartDate(data.start_date || "");
      setStartTime(data.start_time || "");
      setEndTime(data.end_time || "");
      setCategory(data.category || "");
      setDescription(data.description || "");
      setPrice(data.price || "");

      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to scan image");
      setStep("error");
    }
  }

  async function handleSave() {
    if (!title.trim() || !venueName.trim() || !startDate || !startTime || !category) {
      setError("Please fill in title, venue, date, time, and category.");
      return;
    }

    setStep("saving");
    setError("");

    try {
      // Build ISO start_time
      const startISO = `${startDate}T${startTime}:00+01:00`;
      const endISO = endTime ? `${startDate}T${endTime}:00+01:00` : null;

      // Handle overnight: if end_time < start_time, it's the next day
      let finalEndISO = endISO;
      if (endTime && startTime && endTime < startTime) {
        const nextDay = new Date(new Date(startDate).getTime() + 86400000);
        const nd = nextDay.toISOString().slice(0, 10);
        finalEndISO = `${nd}T${endTime}:00+01:00`;
      }

      const res = await fetch("/api/events/scan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          venue_name: venueName.trim(),
          address: address.trim() || null,
          neighborhood: extracted?.neighborhood || null,
          start_time: startISO,
          end_time: finalEndISO,
          category,
          subcategory: extracted?.subcategory || null,
          description: description.trim() || null,
          price: price.trim() || null,
          tags: extracted?.tags || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        if (res.status === 409) {
          setError("This event already exists on the map!");
          setStep("review");
          return;
        }
        throw new Error(err.error || "Save failed");
      }

      setStep("done");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setStep("review");
    }
  }

  function handleRetake() {
    setImagePreview(null);
    setImageFile(null);
    setExtracted(null);
    setError("");
    setStep("capture");
  }

  const header = (titleText: string, showBack: boolean) => (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
      {showBack ? (
        <button
          onClick={step === "review" ? handleRetake : onClose}
          className="text-[13px] font-semibold text-gray-600 active:text-gray-900 transition"
        >
          {"\u2039"} Back
        </button>
      ) : (
        <div className="w-12" />
      )}
      <h2 className="text-[15px] font-bold text-gray-900">{titleText}</h2>
      <button
        onClick={onClose}
        className="text-gray-400 active:text-gray-600 transition"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );

  // Capture step
  if (step === "capture") {
    return (
      <div className="flex flex-col h-full bg-[#faf9f6]">
        {header("Scan a Flyer", false)}
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5">
          {imagePreview ? (
            <>
              <div className="w-full max-w-[280px] rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
                <img src={imagePreview} alt="Flyer preview" className="w-full h-auto" />
              </div>
              <div className="flex gap-3 w-full max-w-[280px]">
                <button
                  onClick={handleRetake}
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-[14px] font-medium text-gray-700 active:bg-gray-50 transition"
                >
                  Retake
                </button>
                <button
                  onClick={handleScan}
                  className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-[14px] font-medium active:bg-gray-700 transition"
                >
                  Scan it
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-2">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </div>
              <div className="text-center">
                <p className="text-[15px] font-semibold text-gray-900 mb-1">Snap a flyer or poster</p>
                <p className="text-[13px] text-gray-500 max-w-[240px]">
                  Take a photo or upload an image and we'll extract the event details automatically.
                </p>
              </div>
              <div className="flex flex-col gap-3 w-full max-w-[280px] mt-2">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="w-full py-3.5 rounded-xl bg-gray-900 text-white text-[14px] font-medium active:bg-gray-700 transition flex items-center justify-center gap-2"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                  Take Photo
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3.5 rounded-xl border border-gray-200 text-[14px] font-medium text-gray-700 active:bg-gray-50 transition flex items-center justify-center gap-2"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  Upload Image
                </button>
              </div>
            </>
          )}

          {error && (
            <p className="text-red-500 text-xs bg-red-50 px-3 py-2 rounded-xl">{error}</p>
          )}

          {/* Hidden file inputs */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
          />
        </div>
      </div>
    );
  }

  // Scanning step
  if (step === "scanning") {
    return (
      <div className="flex flex-col h-full bg-[#faf9f6]">
        {header("Scanning...", false)}
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center animate-pulse">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
          <p className="text-[13px] text-gray-500">Reading the flyer...</p>
          {imagePreview && (
            <div className="w-32 rounded-xl overflow-hidden border border-gray-200 opacity-50">
              <img src={imagePreview} alt="Scanning" className="w-full h-auto" />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Error step
  if (step === "error") {
    return (
      <div className="flex flex-col h-full bg-[#faf9f6]">
        {header("Oops", true)}
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          </div>
          <p className="text-[14px] text-gray-700 font-medium">Couldn't read this flyer</p>
          <p className="text-[13px] text-gray-500 max-w-[260px]">{error || "Try a clearer photo with good lighting."}</p>
          <button
            onClick={handleRetake}
            className="mt-2 px-8 py-3 rounded-xl bg-gray-900 text-white font-medium text-base active:bg-gray-700 transition"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Review step — editable form
  if (step === "review" || step === "saving") {
    return (
      <div className="flex flex-col h-full bg-[#faf9f6]">
        {header("Review Event", true)}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="max-w-sm mx-auto px-5 py-5 space-y-4">
            {/* Thumbnail */}
            {imagePreview && (
              <div className="flex justify-center">
                <div className="w-24 h-24 rounded-xl overflow-hidden border border-gray-200">
                  <img src={imagePreview} alt="Flyer" className="w-full h-full object-cover" />
                </div>
              </div>
            )}

            <p className="text-[12px] text-gray-400 text-center">Check the details below and edit if needed.</p>

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
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-black/10"
              />
            </div>

            {/* Venue */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Venue *</label>
              <input
                type="text"
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-black/10"
              />
            </div>

            {/* Address */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Oranienstr. 25, 10999 Berlin"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-black/10"
              />
            </div>

            {/* Date & Time row */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Date *</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-black/10"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Start *</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-black/10"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">End</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-black/10"
                />
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Category *</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(CATEGORIES).map(([key, cat]) => (
                  <button
                    key={key}
                    onClick={() => setCategory(key)}
                    className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition ${
                      category === key
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 bg-white text-gray-600 active:bg-gray-50"
                    }`}
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
                placeholder="e.g. Free, €12, from €8"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-black/10"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-black/10 resize-none"
              />
            </div>

            {/* Submit */}
            <button
              onClick={handleSave}
              disabled={step === "saving"}
              className="w-full py-3 rounded-xl bg-gray-900 text-white font-medium text-[15px] disabled:opacity-50 transition active:bg-gray-700"
            >
              {step === "saving" ? "Saving..." : "Add to map"}
            </button>

            <div className="h-4" />
          </div>
        </div>
      </div>
    );
  }

  // Done step
  return (
    <div className="flex flex-col h-full bg-[#faf9f6]">
      {header("Added!", false)}
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-5">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">Event added to the map!</h3>
        <p className="text-[13px] text-gray-500 leading-relaxed max-w-[280px]">
          Your scanned event is now live. Thanks for adding to Berlin's event scene!
        </p>
        <button
          onClick={onClose}
          className="mt-8 px-8 py-3 rounded-xl bg-gray-900 text-white font-medium text-base active:bg-gray-700 transition"
        >
          Done
        </button>
      </div>
    </div>
  );
}
