"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES } from "@/lib/types";

interface Props {
  onBack: () => void;
}

type Frequency = "instant" | "daily" | "weekly" | "off";

const FREQ_OPTIONS: { value: Frequency; label: string; desc: string }[] = [
  { value: "instant", label: "Instant", desc: "Get notified immediately" },
  { value: "daily", label: "Daily digest", desc: "Once a day summary" },
  { value: "weekly", label: "Weekly digest", desc: "Once a week summary" },
  { value: "off", label: "Off", desc: "No notifications" },
];

export default function NotificationSettings({ onBack }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [genres, setGenres] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    // Check current notification permission
    if ("Notification" in window) {
      setPermissionDenied(Notification.permission === "denied");
      setEnabled(Notification.permission === "granted");
    }

    // Load existing preferences
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("push_subscriptions")
        .select("notify_genres, notify_frequency")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (data) {
        setGenres(new Set(data.notify_genres || []));
        setFrequency(data.notify_frequency || "daily");
      }
    }
    load();
  }, []);

  async function handleToggle() {
    if (!("Notification" in window)) return;

    if (!enabled) {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        setEnabled(true);
        setPermissionDenied(false);
        await subscribeAndSave();
      } else if (permission === "denied") {
        setPermissionDenied(true);
      }
    } else {
      setEnabled(false);
      // Update to off
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("push_subscriptions")
          .update({ notify_frequency: "off" })
          .eq("user_id", user.id);
      }
    }
  }

  async function subscribeAndSave() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      });

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const subJson = sub.toJSON();
      await supabase.from("push_subscriptions").upsert(
        {
          user_id: user.id,
          endpoint: subJson.endpoint,
          keys: subJson.keys,
          notify_genres: Array.from(genres),
          notify_frequency: frequency,
        },
        { onConflict: "user_id,endpoint" }
      );
    } catch {
      // Service worker or push not available — save preferences anyway
      await savePreferences();
    }
  }

  async function savePreferences() {
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Try to update existing, if no row exists this is fine
    await supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: user.id,
          endpoint: "preferences-only",
          keys: {},
          notify_genres: Array.from(genres),
          notify_frequency: frequency,
        },
        { onConflict: "user_id,endpoint" }
      );

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function toggleGenre(genre: string) {
    setGenres((prev) => {
      const next = new Set(prev);
      if (next.has(genre)) next.delete(genre);
      else next.add(genre);
      return next;
    });
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#faf9f6]">
      <div className="max-w-sm mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={onBack}
            className="text-sm font-semibold text-gray-600 active:text-gray-900"
          >
            {"\u2039"} Back
          </button>
          <h1 className="text-lg font-bold">Notifications</h1>
          <div className="w-12" />
        </div>

        {/* Enable toggle */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">Push notifications</p>
              <p className="text-xs text-gray-500 mt-0.5">Get notified about new events</p>
            </div>
            <button
              onClick={handleToggle}
              className={`relative w-12 h-7 rounded-full transition-colors ${
                enabled ? "bg-emerald-500" : "bg-gray-300"
              }`}
            >
              <div
                className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                  enabled ? "translate-x-5.5 left-0.5" : "left-0.5"
                }`}
                style={{ transform: enabled ? "translateX(22px)" : "translateX(0)" }}
              />
            </button>
          </div>
          {permissionDenied && (
            <p className="text-xs text-red-500 mt-2">
              Notifications are blocked. Enable them in your browser settings.
            </p>
          )}
        </div>

        {/* Frequency */}
        <div className="bg-white rounded-2xl border border-gray-100 mb-4 overflow-hidden">
          <p className="text-xs font-medium text-gray-500 px-4 pt-3 pb-1">Frequency</p>
          {FREQ_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFrequency(opt.value)}
              className={`w-full text-left px-4 py-3 flex items-center justify-between border-t border-gray-50 active:bg-gray-50 transition ${
                frequency === opt.value ? "text-gray-900" : "text-gray-500"
              }`}
            >
              <div>
                <p className="text-sm font-medium">{opt.label}</p>
                <p className="text-[11px] text-gray-400">{opt.desc}</p>
              </div>
              {frequency === opt.value && (
                <span className="text-emerald-500 font-bold text-sm">{"\u2713"}</span>
              )}
            </button>
          ))}
        </div>

        {/* Category preferences */}
        <div className="mb-6">
          <p className="text-xs font-medium text-gray-500 mb-3 px-1">
            Notify me about
            {genres.size === 0 && <span className="text-gray-400"> (all categories)</span>}
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CATEGORIES).map(([key, cat]) => (
              <button
                key={key}
                onClick={() => toggleGenre(key)}
                className={`px-3.5 py-2 rounded-full text-sm font-medium transition ${
                  genres.has(key) || genres.size === 0
                    ? "text-white"
                    : "bg-gray-100 text-gray-500"
                }`}
                style={genres.has(key) || genres.size === 0 ? { backgroundColor: cat.color } : {}}
              >
                {cat.emoji} {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Save */}
        <button
          onClick={savePreferences}
          disabled={saving}
          className="w-full py-3 rounded-xl bg-[#1a1a1a] text-white font-medium text-base disabled:opacity-50 transition"
        >
          {saving ? "Saving..." : saved ? "Saved!" : "Save preferences"}
        </button>
      </div>
    </div>
  );
}
