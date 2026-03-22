"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ScanFlyer from "./ScanFlyer";

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

type View = "menu" | "host" | "host-done" | "tip" | "tip-done" | "scan";

export default function CreateEvent({ onClose, onCreated }: Props) {
  const [view, setView] = useState<View>("menu");
  const [email, setEmail] = useState("");
  const [orgName, setOrgName] = useState("");
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const INVITE_TEXT = `Hey! I found this really cool Berlin event map and thought you should list your events there. Check it out: https://event-map-ten.vercel.app`;

  async function handleHostSubmit() {
    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const { error: insertErr } = await supabase.from("interested_venues").insert({
        email: email.trim().toLowerCase(),
        org_name: orgName.trim() || null,
        user_id: user?.id || null,
      });

      if (insertErr) {
        if (insertErr.message.includes("duplicate") || insertErr.message.includes("unique")) {
          setError("This email is already on the waitlist!");
        } else {
          setError(insertErr.message);
        }
        setSubmitting(false);
        return;
      }

      setView("host-done");
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setSubmitting(false);
  }

  async function handleTipSubmit() {
    if (!link.trim()) {
      setError("Please paste a link.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const { error: insertErr } = await supabase.from("venue_tips").insert({
        link: link.trim(),
        note: note.trim() || null,
        user_id: user?.id || null,
      });

      if (insertErr) {
        setError(insertErr.message);
        setSubmitting(false);
        return;
      }

      setView("tip-done");
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setSubmitting(false);
  }

  async function handleCopyInvite() {
    try {
      await navigator.clipboard.writeText(INVITE_TEXT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API
      const textarea = document.createElement("textarea");
      textarea.value = INVITE_TEXT;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleShare() {
    if (navigator.share) {
      navigator.share({ text: INVITE_TEXT }).catch(() => {});
    } else {
      handleCopyInvite();
    }
  }

  const header = (title: string, showBack: boolean) => (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
      {showBack ? (
        <button
          onClick={() => { setView("menu"); setError(""); }}
          className="text-[13px] font-semibold text-gray-600 active:text-gray-900 transition"
        >
          {"\u2039"} Back
        </button>
      ) : (
        <div className="w-12" />
      )}
      <h2 className="text-[15px] font-bold text-gray-900">{title}</h2>
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

  // Menu view
  if (view === "menu") {
    return (
      <div className="flex flex-col h-full bg-[#faf9f6]">
        {header("Add to the map", false)}
        <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto px-6 gap-4">
          <button
            onClick={() => setView("host")}
            className="bg-white rounded-2xl border border-gray-100 p-5 text-left active:bg-gray-50 transition shadow-sm"
          >
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <line x1="19" y1="8" x2="19" y2="14"/>
                  <line x1="22" y1="11" x2="16" y2="11"/>
                </svg>
              </div>
              <div>
                <p className="text-[15px] font-semibold text-gray-900">I organize events</p>
                <p className="text-[13px] text-gray-500 mt-0.5">Get your venue on the map. Join the waitlist for early access.</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setView("tip")}
            className="bg-white rounded-2xl border border-gray-100 p-5 text-left active:bg-gray-50 transition shadow-sm"
          >
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
              </div>
              <div>
                <p className="text-[15px] font-semibold text-gray-900">Missing a spot?</p>
                <p className="text-[13px] text-gray-500 mt-0.5">Know a venue or event we should add? Send us a tip or invite the organizer.</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setView("scan")}
            className="bg-white rounded-2xl border border-gray-100 p-5 text-left active:bg-gray-50 transition shadow-sm"
          >
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </div>
              <div>
                <p className="text-[15px] font-semibold text-gray-900">Scan a flyer</p>
                <p className="text-[13px] text-gray-500 mt-0.5">Snap a photo of a poster or flyer and we'll add the event automatically.</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // Host registration
  if (view === "host") {
    return (
      <div className="flex flex-col h-full bg-[#faf9f6]">
        {header("Join as a host", true)}
        <div className="max-w-sm mx-auto px-6 py-8 w-full space-y-5">
          <div className="text-center mb-2">
            <p className="text-[13px] text-gray-500">Want your events on the map? Leave your email and we'll reach out when registration opens.</p>
          </div>

          {error && (
            <p className="text-red-500 text-xs bg-red-50 px-3 py-2 rounded-xl">{error}</p>
          )}

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Email *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourvenue.com"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-black/10"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Venue / Organization name</label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="e.g. Klunkerkranich"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-black/10"
            />
          </div>

          <button
            onClick={handleHostSubmit}
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-gray-900 text-white font-medium text-base disabled:opacity-50 transition active:bg-gray-700"
          >
            {submitting ? "Submitting..." : "Join the waitlist"}
          </button>
        </div>
      </div>
    );
  }

  // Host success
  if (view === "host-done") {
    return (
      <div className="flex flex-col h-full bg-[#faf9f6]">
        {header("You're in!", false)}
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-5">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">Thanks for being an early bird!</h3>
          <p className="text-[13px] text-gray-500 leading-relaxed max-w-[280px]">
            We're building something special for Berlin's event scene. You're on the list and we'll reach out as soon as host registration opens.
          </p>
          <button
            onClick={onClose}
            className="mt-8 px-8 py-3 rounded-xl bg-gray-900 text-white font-medium text-base active:bg-gray-700 transition"
          >
            Got it
          </button>
        </div>
      </div>
    );
  }

  // Venue tip
  if (view === "tip") {
    return (
      <div className="flex flex-col h-full bg-[#faf9f6]">
        {header("Send a tip", true)}
        <div className="max-w-sm mx-auto px-6 py-8 w-full space-y-5">
          <div className="text-center mb-2">
            <p className="text-[13px] text-gray-500">Know a place that should be on the map? Paste a link and we'll look into it.</p>
          </div>

          {error && (
            <p className="text-red-500 text-xs bg-red-50 px-3 py-2 rounded-xl">{error}</p>
          )}

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Website or Google Maps link *</label>
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://..."
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-black/10"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Anything we should know?</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. They have great jazz nights every Thursday"
              rows={2}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-black/10 resize-none"
            />
          </div>

          <button
            onClick={handleTipSubmit}
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-gray-900 text-white font-medium text-base disabled:opacity-50 transition active:bg-gray-700"
          >
            {submitting ? "Sending..." : "Send tip"}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 pt-2">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Invite section */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
            <p className="text-[13px] font-medium text-gray-700">Know the organizer? Invite them directly</p>
            <p className="text-[12px] text-gray-400 bg-gray-50 rounded-lg p-3 leading-relaxed">{INVITE_TEXT}</p>
            <div className="flex gap-2">
              <button
                onClick={handleCopyInvite}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-medium text-gray-700 active:bg-gray-50 transition"
              >
                {copied ? "Copied!" : "Copy text"}
              </button>
              <button
                onClick={handleShare}
                className="flex-1 py-2.5 rounded-xl bg-gray-900 text-white text-[13px] font-medium active:bg-gray-700 transition"
              >
                Share
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Scan flyer
  if (view === "scan") {
    return (
      <ScanFlyer
        onClose={onClose}
        onSaved={() => { onCreated(); onClose(); }}
      />
    );
  }

  // Tip success
  return (
    <div className="flex flex-col h-full bg-[#faf9f6]">
      {header("Thanks!", false)}
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-5">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">Tip received!</h3>
        <p className="text-[13px] text-gray-500 leading-relaxed max-w-[280px]">
          We'll check it out and add it to the map if it's a good fit. Thanks for helping us grow!
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
