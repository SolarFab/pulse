"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    if (!message.trim() || !rating) return;
    setSubmitting(true);

    try {
      const supabase = createClient();
      await supabase.from("feedback").insert({
        name: name.trim() || null,
        message: message.trim(),
        rating,
        page: typeof window !== "undefined" ? window.location.pathname : null,
      });
      setDone(true);
      setTimeout(() => {
        setOpen(false);
        setDone(false);
        setName("");
        setMessage("");
        setRating(null);
      }, 1500);
    } catch {
      // silently fail
    }
    setSubmitting(false);
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 z-[100] w-11 h-11 rounded-full bg-violet-600 text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform hover:bg-violet-700"
          aria-label="Give feedback"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            <line x1="9" y1="10" x2="15" y2="10"/>
          </svg>
        </button>
      )}

      {/* Feedback modal */}
      {open && (
        <>
          <div className="fixed inset-0 bg-black/30 z-[100]" onClick={() => setOpen(false)} />
          <div className="fixed bottom-20 right-4 z-[101] w-[calc(100%-2rem)] max-w-[320px] bg-white rounded-2xl shadow-2xl overflow-hidden animate-slide-up">
            {/* Beta badge */}
            <div className="bg-violet-50 px-4 py-2 border-b border-violet-100">
              <p className="text-[11px] text-violet-600 font-medium text-center">
                BETA TESTING — Your feedback shapes this app
              </p>
            </div>

            {done ? (
              <div className="p-8 text-center">
                <div className="text-3xl mb-2">&#x1F64F;</div>
                <p className="text-[14px] font-semibold text-gray-900">Thanks!</p>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {/* Name */}
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name (optional)"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-[14px] focus:outline-none focus:ring-2 focus:ring-violet-200"
                />

                {/* Message */}
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Bug? Feature idea? What do you think?"
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-[14px] focus:outline-none focus:ring-2 focus:ring-violet-200 resize-none"
                />

                {/* Rating */}
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-gray-500 font-medium">Overall:</span>
                  <button
                    onClick={() => setRating("up")}
                    className={`px-3 py-1.5 rounded-lg text-[13px] font-medium border transition flex items-center gap-1.5 ${
                      rating === "up"
                        ? "border-green-500 bg-green-50 text-green-700"
                        : "border-gray-200 text-gray-500 active:bg-gray-50"
                    }`}
                  >
                    <span className="text-[16px]">&#x1F44D;</span> Like it
                  </button>
                  <button
                    onClick={() => setRating("down")}
                    className={`px-3 py-1.5 rounded-lg text-[13px] font-medium border transition flex items-center gap-1.5 ${
                      rating === "down"
                        ? "border-red-500 bg-red-50 text-red-700"
                        : "border-gray-200 text-gray-500 active:bg-gray-50"
                    }`}
                  >
                    <span className="text-[16px]">&#x1F44E;</span> Needs work
                  </button>
                </div>

                {/* Submit */}
                <button
                  onClick={handleSubmit}
                  disabled={!message.trim() || !rating || submitting}
                  className="w-full py-2.5 rounded-xl bg-violet-600 text-white text-[14px] font-medium disabled:opacity-40 transition active:bg-violet-700"
                >
                  {submitting ? "Sending..." : "Send Feedback"}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
