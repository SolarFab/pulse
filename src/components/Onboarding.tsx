"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES } from "@/lib/types";

interface OnboardingProps {
  userId: string;
  onComplete: () => void;
}

// Q0: "How do your weekends look?"
const VIBE_OPTIONS: { key: string; label: string }[] = [
  { key: "music", label: "Always sound on my ears" },
  { key: "nightlife", label: "The night is where I feel best" },
  { key: "culture", label: "Art is my language" },
  { key: "food", label: "If it\u2019s edible, I\u2019m there" },
  { key: "markets", label: "I roll through local markets" },
  { key: "workshops", label: "I\u2019m learning something new" },
  { key: "meetups", label: "Talks, links, and good conversations" },
  { key: "outdoors", label: "Fresh air or it didn\u2019t happen" },
  { key: "family", label: "It\u2019s a family affair" },
];

// Per-category subcategory screens with fun one-liners
const CATEGORY_SCREENS: Record<string, {
  title: string;
  options: { label: string; tags: string[] }[];
}> = {
  music: {
    title: "You\u2019re a music person. What\u2019s your sound?",
    options: [
      { label: "Bass drops and laser beams", tags: ["electronic"] },
      { label: "I need to headbang", tags: ["live-concert", "rock-pop"] },
      { label: "Smoky jazz bar vibes", tags: ["jazz-blues"] },
      { label: "Beethoven was a genius", tags: ["classical"] },
      { label: "Latin passion, always", tags: ["latin", "world-folk"] },
      { label: "Keep it gangsta", tags: ["hip-hop"] },
    ],
  },
  nightlife: {
    title: "The sun goes down. What\u2019s the move?",
    options: [
      { label: "Deep into the club, see you Monday", tags: ["club-night"] },
      { label: "A good party, home by 2", tags: ["party"] },
      { label: "Cocktails and conversation", tags: ["bar-event"] },
      { label: "Make me laugh till I cry", tags: ["comedy"] },
      { label: "Hand me that mic", tags: ["karaoke"] },
    ],
  },
  culture: {
    title: "Art soul. What speaks to you?",
    options: [
      { label: "I stare at art for hours", tags: ["exhibition", "gallery"] },
      { label: "Curtain up, I love the stage", tags: ["theater"] },
      { label: "Lights off, film on", tags: ["cinema"] },
      { label: "A good book reading, a glass of wine", tags: ["reading"] },
      { label: "I live for festival season", tags: ["festival"] },
    ],
  },
  food: {
    title: "If it\u2019s edible, you\u2019re there. What\u2019s your thing?",
    options: [
      { label: "Bottomless brunch, always", tags: ["brunch"] },
      { label: "Surprise me with a pop-up", tags: ["pop-up"] },
      { label: "I\u2019ll taste anything once", tags: ["tasting"] },
      { label: "Sit-down dinner, the whole experience", tags: ["dining-event"] },
      { label: "Street food stall to stall", tags: ["food-market"] },
      { label: "Fresh from the farm, straight to my bag", tags: ["weekly-market"] },
    ],
  },
  markets: {
    title: "You love a good market. What are you hunting?",
    options: [
      { label: "Vintage treasures and weird finds", tags: ["flea-market"] },
      { label: "Local designers and handmade stuff", tags: ["design-market"] },
      { label: "Pop-up fashion, take my money", tags: ["pop-up-fashion"] },
      { label: "Vinyl, books, random gems", tags: ["secondhand"] },
      { label: "Craft and artisan stalls", tags: ["craft-market"] },
    ],
  },
  workshops: {
    title: "You like learning. What pulls you in?",
    options: [
      { label: "Anything I can make with my hands", tags: ["craft", "creative-workshop"] },
      { label: "Teach me a new language", tags: ["language"] },
      { label: "Code, design, digital things", tags: ["digital-skills"] },
      { label: "Move my body \u2014 dance class!", tags: ["dance-class"] },
    ],
  },
  meetups: {
    title: "You\u2019re a connector. Where do you show up?",
    options: [
      { label: "Tech talks and startup energy", tags: ["tech-startup"] },
      { label: "Panels that make me think", tags: ["talk-panel"] },
      { label: "My community, my people", tags: ["community"] },
      { label: "Networking \u2014 yes, I actually like it", tags: ["networking"] },
      { label: "Changing the world, one protest at a time", tags: ["activism"] },
    ],
  },
  outdoors: {
    title: "Fresh air. What\u2019s the plan?",
    options: [
      { label: "Walking tour through hidden Berlin", tags: ["walking-tour"] },
      { label: "Sweat it out \u2014 sports or gym", tags: ["sports"] },
      { label: "Yoga in the park, obviously", tags: ["yoga-fitness"] },
      { label: "Hop on a bike and go", tags: ["bike-tour"] },
      { label: "Movies under the stars", tags: ["outdoor-cinema"] },
    ],
  },
  family: {
    title: "Family time! What\u2019s the vibe?",
    options: [
      { label: "Something the kids will love", tags: ["kids-program"] },
      { label: "Fun for the whole crew", tags: ["family-event"] },
      { label: "Playground + coffee for me", tags: ["playground"] },
      { label: "Museum day \u2014 make it interactive", tags: ["museum-for-kids"] },
    ],
  },
};

// Steps: welcome(0), Q0(1), subcategory screens(2..N+1), outro(last)
type StepType = "welcome" | "q0" | "subcategory" | "outro";

export default function Onboarding({ userId, onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [lockedCategories, setLockedCategories] = useState<string[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, Set<number>>>({}); // category -> selected option indices
  const [saving, setSaving] = useState(false);

  // Calculate step type and total
  const stepInfo = useMemo(() => {
    // step 0 = welcome, step 1 = Q0, steps 2..N+1 = subcategory, step N+2 = outro
    const subScreenCount = lockedCategories.length;
    const total = 2 + subScreenCount + 1; // welcome + Q0 + subs + outro

    if (step === 0) return { type: "welcome" as StepType, total, catIndex: -1 };
    if (step === 1) return { type: "q0" as StepType, total, catIndex: -1 };
    if (step >= 2 && step < 2 + subScreenCount) {
      return { type: "subcategory" as StepType, total, catIndex: step - 2 };
    }
    return { type: "outro" as StepType, total, catIndex: -1 };
  }, [step, lockedCategories]);

  const currentCategoryKey = stepInfo.catIndex >= 0 ? lockedCategories[stepInfo.catIndex] : null;
  const currentCategory = currentCategoryKey ? CATEGORIES[currentCategoryKey] : null;
  const currentScreen = currentCategoryKey ? CATEGORY_SCREENS[currentCategoryKey] : null;

  function toggleCategory(key: string) {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleOption(index: number) {
    if (!currentCategoryKey) return;
    setSelectedOptions((prev) => {
      const current = new Set(prev[currentCategoryKey] || []);
      if (current.has(index)) current.delete(index);
      else current.add(index);
      return { ...prev, [currentCategoryKey]: current };
    });
  }

  function handleQ0Continue() {
    if (selectedCategories.size === 0) return;
    const ordered = VIBE_OPTIONS
      .filter((v) => selectedCategories.has(v.key))
      .map((v) => v.key);
    setLockedCategories(ordered);
    setStep(2); // skip to first subcategory screen
  }

  function handleNext() {
    setStep(step + 1);
  }

  function handleBack() {
    if (step === 2) {
      setStep(1); // back to Q0
    } else if (step > 0) {
      setStep(step - 1);
    }
  }

  async function handleFinish() {
    setSaving(true);
    const supabase = createClient();

    // Build subcategory map from selected options
    const subMap: Record<string, string[]> = {};
    for (const cat of lockedCategories) {
      const screen = CATEGORY_SCREENS[cat];
      const indices = selectedOptions[cat] || new Set();
      const tags: string[] = [];
      indices.forEach((i) => {
        if (screen && screen.options[i]) {
          tags.push(...screen.options[i].tags);
        }
      });
      subMap[cat] = tags;
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

  const progressPercent = stepInfo.total > 1 ? ((step + 1) / stepInfo.total) * 100 : 50;

  return (
    <div className="fixed inset-0 z-[100] bg-[#faf9f6] flex flex-col">
      {/* Top bar */}
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

      {/* Progress bar (hidden on welcome) */}
      {step > 0 && (
        <div className="h-1 bg-gray-200 rounded-full mx-6 mt-3">
          <div
            className="h-1 bg-[#1a1a1a] rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex flex-col min-h-0 px-6 pt-6">

        {/* WELCOME */}
        {stepInfo.type === "welcome" && (
          <div className="flex-1 flex flex-col items-center justify-center -mt-8">
            <div className="text-center max-w-xs">
              <div className="text-5xl mb-6">{"\uD83C\uDF03"}</div>
              <h1 className="text-2xl font-bold mb-3">Discover what&apos;s happening around you</h1>
              <p className="text-gray-500 text-sm leading-relaxed mb-8">
                Berlin has thousands of events every week. Let&apos;s figure out which ones are for you.
              </p>
            </div>
          </div>
        )}

        {/* Q0: "How do your weekends look?" */}
        {stepInfo.type === "q0" && (
          <>
            <h1 className="text-xl font-bold text-center mb-1">What describes you best?</h1>
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
                          selected ? "bg-[#1a1a1a] border-[#1a1a1a]" : "border-gray-300"
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

        {/* SUBCATEGORY SCREENS */}
        {stepInfo.type === "subcategory" && currentCategory && currentScreen && currentCategoryKey && (
          <>
            <div className="text-center mb-6">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-3"
                style={{ background: currentCategory.color + "20" }}
              >
                {currentCategory.emoji}
              </div>
              <h1 className="text-xl font-bold mb-1">{currentScreen.title}</h1>
              <p className="text-sm text-gray-400">Pick your favorites or skip for all</p>
            </div>
            <div className="space-y-2.5">
              {currentScreen.options.map((option, i) => {
                const selected = selectedOptions[currentCategoryKey]?.has(i);
                return (
                  <button
                    key={i}
                    onClick={() => toggleOption(i)}
                    className={`w-full flex items-center gap-3.5 p-3.5 rounded-2xl border-2 transition active:scale-[0.98] ${
                      selected
                        ? "shadow-sm text-white"
                        : "border-gray-200 bg-white text-gray-800"
                    }`}
                    style={selected ? { backgroundColor: currentCategory.color, borderColor: currentCategory.color } : {}}
                  >
                    <span className="flex-1 text-left text-sm font-medium">
                      {option.label}
                    </span>
                    <div
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition ${
                        selected ? "bg-white/30 border-white/50" : "border-gray-300"
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
          </>
        )}

        {/* OUTRO: "We learn from you" */}
        {stepInfo.type === "outro" && (
          <div className="flex-1 flex flex-col items-center justify-center -mt-8">
            <div className="text-center max-w-xs">
              <div className="text-5xl mb-6">{"\uD83E\uDDE0"}</div>
              <h1 className="text-2xl font-bold mb-3">We learn from you</h1>
              <p className="text-gray-500 text-sm leading-relaxed mb-8">
                The more you explore, the smarter your feed gets. Like and save events to teach us your taste.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom button */}
      <div className="px-6 pb-6 pb-safe-bottom">
        {stepInfo.type === "welcome" && (
          <button
            onClick={() => setStep(1)}
            className="w-full py-3.5 rounded-2xl bg-[#1a1a1a] text-white font-semibold text-base transition active:scale-[0.98]"
          >
            Get started
          </button>
        )}
        {stepInfo.type === "q0" && (
          <button
            onClick={handleQ0Continue}
            disabled={selectedCategories.size === 0}
            className="w-full py-3.5 rounded-2xl bg-[#1a1a1a] text-white font-semibold text-base disabled:opacity-30 transition active:scale-[0.98]"
          >
            Continue
          </button>
        )}
        {stepInfo.type === "subcategory" && (
          <button
            onClick={handleNext}
            className="w-full py-3.5 rounded-2xl bg-[#1a1a1a] text-white font-semibold text-base transition active:scale-[0.98]"
          >
            Continue
          </button>
        )}
        {stepInfo.type === "outro" && (
          <button
            onClick={handleFinish}
            disabled={saving}
            className="w-full py-3.5 rounded-2xl bg-[#1a1a1a] text-white font-semibold text-base disabled:opacity-50 transition active:scale-[0.98]"
          >
            {saving ? "Setting up..." : "Let\u0027s go!"}
          </button>
        )}
      </div>
    </div>
  );
}
