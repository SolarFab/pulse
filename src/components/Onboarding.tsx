"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES } from "@/lib/types";

interface OnboardingProps {
  userId: string;
  onComplete: () => void;
}

export default function Onboarding({ userId, onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [genres, setGenres] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalSteps = 3;

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop();
    const path = `${userId}/avatar.${ext}`;

    await supabase.storage.from("avatars").upload(path, file, { upsert: true });

    const { data: { publicUrl } } = supabase.storage
      .from("avatars")
      .getPublicUrl(path);

    setAvatarUrl(`${publicUrl}?t=${Date.now()}`);
    setUploading(false);
  }

  function toggleGenre(genre: string) {
    setGenres((prev) => {
      const next = new Set(prev);
      if (next.has(genre)) next.delete(genre);
      else next.add(genre);
      return next;
    });
  }

  async function handleFinish() {
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim() || null,
        avatar_url: avatarUrl,
        genres: Array.from(genres),
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    setSaving(false);
    onComplete();
  }

  async function handleSkip() {
    const supabase = createClient();
    await supabase
      .from("profiles")
      .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
      .eq("id", userId);
    onComplete();
  }

  return (
    <div className="fixed inset-0 z-[100] bg-[#faf9f6] flex flex-col">
      {/* Skip button */}
      <div className="flex justify-end px-6 pt-safe-top mt-4">
        <button
          onClick={handleSkip}
          className="text-sm text-gray-400 font-medium hover:text-gray-600 transition"
        >
          Skip
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 -mt-8">
        {/* Step 0: Welcome */}
        {step === 0 && (
          <div className="text-center max-w-xs">
            <div className="text-5xl mb-6">{"\uD83C\uDF03"}</div>
            <h1 className="text-2xl font-bold mb-3">Welcome to NachtKarte</h1>
            <p className="text-gray-500 text-sm leading-relaxed mb-8">
              Discover what&apos;s happening in Berlin. Let&apos;s set up your profile so we can
              show you the events you&apos;ll love.
            </p>
            <button
              onClick={() => setStep(1)}
              className="w-full py-3 rounded-xl bg-[#1a1a1a] text-white font-medium text-base transition"
            >
              Get started
            </button>
          </div>
        )}

        {/* Step 1: Name & Photo */}
        {step === 1 && (
          <div className="w-full max-w-xs">
            <h2 className="text-xl font-bold text-center mb-2">About you</h2>
            <p className="text-sm text-gray-500 text-center mb-8">
              Add your name and a photo
            </p>

            {/* Avatar upload */}
            <div className="flex flex-col items-center mb-6">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="relative group"
                disabled={uploading}
              >
                <div className="w-24 h-24 rounded-full bg-gray-200 overflow-hidden border-2 border-white shadow-lg">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                        <circle cx="12" cy="13" r="4"/>
                      </svg>
                    </div>
                  )}
                </div>
                <div className="absolute bottom-0 right-0 w-8 h-8 bg-[#1a1a1a] rounded-full flex items-center justify-center shadow-md">
                  <span className="text-white text-sm">+</span>
                </div>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
              <p className="text-xs text-gray-400 mt-2">
                {uploading ? "Uploading..." : "Add a photo"}
              </p>
            </div>

            {/* Name input */}
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-base text-center focus:outline-none focus:ring-2 focus:ring-black/10 mb-8"
            />

            <button
              onClick={() => setStep(2)}
              className="w-full py-3 rounded-xl bg-[#1a1a1a] text-white font-medium text-base transition"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 2: Genres */}
        {step === 2 && (
          <div className="w-full max-w-xs">
            <h2 className="text-xl font-bold text-center mb-2">What do you like?</h2>
            <p className="text-sm text-gray-500 text-center mb-8">
              Pick categories you&apos;re interested in
            </p>

            <div className="flex flex-wrap justify-center gap-2.5 mb-10">
              {Object.entries(CATEGORIES).map(([key, cat]) => (
                <button
                  key={key}
                  onClick={() => toggleGenre(key)}
                  className={`px-4 py-2.5 rounded-full text-sm font-medium transition ${
                    genres.has(key)
                      ? "text-white shadow-md"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                  style={genres.has(key) ? { backgroundColor: cat.color } : {}}
                >
                  {cat.emoji} {cat.label}
                </button>
              ))}
            </div>

            <button
              onClick={handleFinish}
              disabled={saving}
              className="w-full py-3 rounded-xl bg-[#1a1a1a] text-white font-medium text-base disabled:opacity-50 transition"
            >
              {saving ? "Setting up..." : "Let\u0027s go!"}
            </button>
          </div>
        )}
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-2 pb-8 pb-safe-bottom">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition ${
              i === step ? "bg-[#1a1a1a] w-6" : "bg-gray-300"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
