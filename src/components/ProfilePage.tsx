"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Profile, CATEGORIES } from "@/lib/types";
import NotificationSettings from "@/components/NotificationSettings";

interface ProfilePageProps {
  onBack: () => void;
  onLogout: () => void;
}

export default function ProfilePage({ onBack, onLogout }: ProfilePageProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [genres, setGenres] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [email, setEmail] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email || "");

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (data) {
        setProfile(data);
        setDisplayName(data.display_name || "");
        setGenres(new Set(data.genres || []));
      }
    }
    load();
  }, []);

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim() || null,
        genres: Array.from(genres),
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    setUploading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop();
    const path = `${profile.id}/avatar.${ext}`;

    await supabase.storage.from("avatars").upload(path, file, { upsert: true });

    const { data: { publicUrl } } = supabase.storage
      .from("avatars")
      .getPublicUrl(path);

    const avatarUrl = `${publicUrl}?t=${Date.now()}`;

    await supabase
      .from("profiles")
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq("id", profile.id);

    setProfile({ ...profile, avatar_url: avatarUrl });
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

  if (showNotifications) {
    return <NotificationSettings onBack={() => setShowNotifications(false)} />;
  }

  if (!profile) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#faf9f6]">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    );
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
          <h1 className="text-lg font-bold">Profile</h1>
          <div className="w-12" />
        </div>

        {/* Avatar */}
        <div className="flex flex-col items-center mb-8">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="relative group"
            disabled={uploading}
          >
            <div className="w-24 h-24 rounded-full bg-gray-200 overflow-hidden border-2 border-white shadow-lg">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-3xl">
                  {displayName ? displayName[0].toUpperCase() : "?"}
                </div>
              )}
            </div>
            <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition flex items-center justify-center">
              <span className="text-white text-xs font-medium">
                {uploading ? "..." : "Edit"}
              </span>
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarUpload}
            className="hidden"
          />
          <p className="text-xs text-gray-400 mt-2">Tap to change photo</p>
        </div>

        {/* Email (read-only) */}
        <div className="mb-4">
          <label className="text-xs font-medium text-gray-500 mb-1 block">Email</label>
          <p className="px-4 py-3 rounded-xl bg-gray-100 text-sm text-gray-500">{email}</p>
        </div>

        {/* Display name */}
        <div className="mb-6">
          <label className="text-xs font-medium text-gray-500 mb-1 block">Display name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-black/10"
          />
        </div>

        {/* Genre preferences */}
        <div className="mb-6">
          <label className="text-xs font-medium text-gray-500 mb-3 block">
            Favorite categories
          </label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CATEGORIES).map(([key, cat]) => (
              <button
                key={key}
                onClick={() => toggleGenre(key)}
                className={`px-3.5 py-2 rounded-full text-sm font-medium transition ${
                  genres.has(key)
                    ? "text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
                style={genres.has(key) ? { backgroundColor: cat.color } : {}}
              >
                {cat.emoji} {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 rounded-xl bg-[#1a1a1a] text-white font-medium text-base disabled:opacity-50 transition mb-6"
        >
          {saving ? "Saving..." : saved ? "Saved!" : "Save changes"}
        </button>

        {/* Settings links */}
        <div className="bg-white rounded-2xl border border-gray-100 mb-6 overflow-hidden">
          <button
            onClick={() => setShowNotifications(true)}
            className="w-full text-left px-4 py-3.5 flex items-center justify-between active:bg-gray-50 transition"
          >
            <div className="flex items-center gap-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              <span className="text-sm font-medium text-gray-900">Notifications</span>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>

        {/* Logout */}
        <button
          onClick={onLogout}
          className="w-full py-3 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm hover:bg-gray-50 transition"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
