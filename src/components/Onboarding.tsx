"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, SUBCATEGORIES } from "@/lib/types";

interface OnboardingProps {
  userId: string;
  onComplete: () => void;
}

const VIBE_OPTIONS: { key: string; label: string }[] = [
  { key: "music", label: "Live music that gives me chills" },
  { key: "nightlife", label: "Dancing until the sun comes up" },
  { key: "culture", label: "Art that makes me think" },
  { key: "food", label: "Eating my way through Berlin" },
  { key: "markets", label: "Treasure hunting at flea markets" },
  { key: "workshops", label: "Learning something new with my hands" },
  { key: "meetups", label: "Finding my people" },
  { key: "outdoors", label: "Fresh air and adventures" },
  { key: "family", label: "Fun stuff with the kids" },
];

export default function Onboarding({ userId, onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  // Q0 selections (mutable until user taps Continue)
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  // Locked list after Q0 — drives subcategory screens
  const [lockedCategories, setLockedCategories] = useState<string[]>([]);
  const [subcategorySelections, setSubcategorySelections] = useState<Record<string, Set<string>>>({});
  const [saving, setSaving] = useState(false);

  // Total steps: Q0 + one screen per selected category
  const totalSteps = 1 + lockedCategories.length;
  const isQ0 = step === 0;
  const currentCategoryIndex = step - 1;
  const currentCategoryKey = lockedCategories[currentCategoryIndex] || null;
  const currentCategory = currentCategoryKey ? CATEGORIES[currentCategoryKey] : null;

  const currentSubcategories = useMemo(() => {
    if (!currentCategoryKey) return [];
    return (SUBCATEGORIES[currentCategoryKey] || []).filter((s) => s.tag !== "");
  }, [currentCategoryKey]);

  function toggleCategory(key: string) {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSubcategory(tag: string) {
    if (!currentCategoryKey) return;
    setSubcategorySelections((prev) => {
      const current = new Set(prev[currentCategoryKey] || []);
      if (current.has(tag)) current.delete(tag);
      else current.add(tag);
      return { ...prev, [currentCategoryKey]: current };
    });
  }

  function handleQ0Continue() {
    if (selectedCategories.size === 0) return;
    // Lock category order (preserve VIBE_OPTIONS order)
    const ordered = VIBE_OPTIONS
      .filter((v) => selectedCategories.has(v.key))
      .map((v) => v.key);
    setLockedCategories(ordered);
    setStep(1);
  }

  function handleNext() {
    if (step < totalSteps - 1) {
      setStep(step + 1);
    } else {
      handleFinish();
    }
  }

  function handleBack() {
    if (step > 0) setStep(step - 1);
  }

  async function handleFinish() {
    setSaving(true);
    const supabase = createClient();

    const subMap: Record<string, string[]> = {};
    for (const cat of lockedCategories) {
      subMap[cat] = Array.from(subcategorySelections[cat] || []);
    }

    await supabase
      .from("profiles")
      .update({
        genres: lockedCategories,
        subcategories: subMap,
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

  const isLastStep = step === totalSteps - 1 && totalSteps > 1;
  const progressPercent = totalSteps > 1 ? ((step + 1) / totalSteps) * 100 : (step === 0 ? 50 : 100);

  return (
    <div className="fixed inset-0 z-[100] bg-[#faf9f6] flex flex-col">
      {/* Top bar: back + skip */}
      <div className="flex items-center justify-between px-5 pt-safe-top mt-3">
        {step > 0 ? (
          <button
            onClick={handleBack}
            className="w-9 h-9 flex items-center justify-center rounded-full text-gray-500 active:bg-gray-100 transition"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        ) : (
          <div className="w-9" />
        )}
        <button
          onClick={handleSkip}
          className="text-sm text-gray-400 font-medium hover:text-gray-600 transition"
        >
          Skip
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-200 rounded-full mx-6 mt-3">
        <div
          className="h-1 bg-[#1a1a1a] rounded-full transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col min-h-0 px-6 pt-6">
        {/* Q0: Category vibes */}
        {isQ0 && (
          <>
            <h1 className="text-xl font-bold text-center mb-1">What sounds like the best evening?</h1>
            <p className="text-sm text-gray-400 text-center mb-5">Pick as many as you like</p>
            <div className="flex-1 overflow-y-auto -mx-1 pb-4">
              <div className="space-y-2.5 px-1">
                {VIBE_OPTIONS.map(({ key, label }) => {
                  const cat = CATEGORIES[key];
                  const selected = selectedCategories.has(key);
                  return (
                    <button
                      key={key}
                      onClick={() => toggleCategory(key)}
                      className={`w-full flex items-center gap-3.5 p-3.5 rounded-2xl border-2 transition active:scale-[0.98] ${
                        selected
                          ? "border-gray-900 bg-white shadow-sm"
                          : "border-gray-200 bg-white"
                      }`}
                    >
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center text-lg shrink-0"
                        style={{ background: cat.color + "20" }}
                      >
                        {cat.emoji}
                      </div>
                      <span className="flex-1 text-left text-sm font-medium text-gray-800">
                        {label}
                      </span>
                      <div
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition ${
                          selected
                            ? "bg-[#1a1a1a] border-[#1a1a1a]"
                            : "border-gray-300"
                        }`}
                      >
                        {selected && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Subcategory screens */}
        {!isQ0 && currentCategory && currentCategoryKey && (
          <>
            <div className="text-center mb-6">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-3"
                style={{ background: currentCategory.color + "20" }}
              >
                {currentCategory.emoji}
              </div>
              <h1 className="text-xl font-bold mb-1">
                What kind of {currentCategory.label.toLowerCase()}?
              </h1>
              <p className="text-sm text-gray-400">
                Pick your favorites or skip for all
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2.5">
              {currentSubcategories.map((sub) => {
                const selected = subcategorySelections[currentCategoryKey]?.has(sub.tag);
                return (
                  <button
                    key={sub.tag}
                    onClick={() => toggleSubcategory(sub.tag)}
                    className={`px-4 py-2.5 rounded-full text-sm font-medium transition active:scale-95 ${
                      selected
                        ? "text-white shadow-md"
                        : "bg-gray-100 text-gray-600"
                    }`}
                    style={selected ? { backgroundColor: currentCategory.color } : {}}
                  >
                    {sub.label}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Bottom: Continue button */}
      <div className="px-6 pb-6 pb-safe-bottom">
        {isQ0 ? (
          <button
            onClick={handleQ0Continue}
            disabled={selectedCategories.size === 0}
            className="w-full py-3.5 rounded-2xl bg-[#1a1a1a] text-white font-semibold text-base disabled:opacity-30 transition active:scale-[0.98]"
          >
            Continue
          </button>
        ) : (
          <button
            onClick={handleNext}
            disabled={saving}
            className="w-full py-3.5 rounded-2xl bg-[#1a1a1a] text-white font-semibold text-base disabled:opacity-50 transition active:scale-[0.98]"
          >
            {saving ? "Setting up..." : isLastStep ? "Let\u0027s go!" : "Continue"}
          </button>
        )}
      </div>
    </div>
  );
}
