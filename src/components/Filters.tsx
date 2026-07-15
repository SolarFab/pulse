"use client";

import { useState, useMemo, useRef } from "react";
import { CATEGORIES, SUBCATEGORIES, TimeFilter, TIME_LABELS } from "@/lib/types";

export interface DateRange {
  from: string;
  to: string;
}

interface Props {
  timeFilter: TimeFilter;
  activeCategories: Set<string>;
  activeSubtag: string | null;
  onTimeChange: (t: TimeFilter) => void;
  onCategoryToggle: (cat: string) => void;
  onSubtagSelect: (category: string, tag: string | null) => void;
  eventCount: number;
  dateRange: DateRange | null;
  onDateRange: (range: DateRange | null) => void;
}

// Main time options render as chips (like the landing mockup);
// the rest live in the "more" dropdown.
const TIME_CHIP_OPTIONS: TimeFilter[] = ["today", "tonight", "tomorrow", "weekend"];
const TIME_MORE_OPTIONS: TimeFilter[] = ["now", "2hours"];

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function fmtShort(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("de-DE", {
    day: "numeric",
    month: "short",
  });
}

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayStr() {
  return toDateStr(new Date());
}

function getMonthGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];

  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

function MonthCalendar({
  year,
  month,
  rangeFrom,
  rangeTo,
  onDayClick,
}: {
  year: number;
  month: number;
  rangeFrom: string;
  rangeTo: string;
  onDayClick: (dateStr: string) => void;
}) {
  const cells = useMemo(() => getMonthGrid(year, month), [year, month]);
  const today = todayStr();

  const monthLabel = new Date(year, month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div>
      <p className="text-[13px] font-semibold text-gray-900 text-center mb-2">
        {monthLabel}
      </p>
      <div className="grid grid-cols-7 gap-0">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="text-[10px] text-gray-400 font-medium text-center py-1"
          >
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`e${i}`} className="h-9" />;
          }

          const dateStr = toDateStr(new Date(year, month, day));
          const isPast = dateStr < today;
          const isFrom = dateStr === rangeFrom;
          const isTo = dateStr === rangeTo;
          const isInRange =
            rangeFrom && rangeTo && dateStr > rangeFrom && dateStr < rangeTo;
          const isEndpoint = isFrom || isTo;
          const isToday = dateStr === today;

          return (
            <div
              key={dateStr}
              className={`relative h-9 flex items-center justify-center ${
                isInRange ? "bg-blue-50" : ""
              } ${isFrom && rangeTo && rangeFrom !== rangeTo ? "rounded-l-full bg-blue-50" : ""} ${
                isTo && rangeFrom && rangeFrom !== rangeTo ? "rounded-r-full bg-blue-50" : ""
              }`}
            >
              <button
                disabled={isPast}
                onClick={() => onDayClick(dateStr)}
                className={`relative z-10 w-8 h-8 rounded-full text-[13px] font-medium transition-all ${
                  isEndpoint
                    ? "bg-gray-900 text-white"
                    : isPast
                      ? "text-gray-300"
                      : isToday
                        ? "text-gray-900 font-bold"
                        : "text-gray-700 active:bg-gray-100"
                }`}
              >
                {day}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Filters({
  timeFilter,
  activeCategories,
  activeSubtag,
  onTimeChange,
  onCategoryToggle,
  onSubtagSelect,
  eventCount,
  dateRange,
  onDateRange,
}: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [subDropdown, setSubDropdown] = useState<string | null>(null);
  const [subDropdownLeft, setSubDropdownLeft] = useState(0);
  const pillsContainerRef = useRef<HTMLDivElement>(null);
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [selFrom, setSelFrom] = useState("");
  const [selTo, setSelTo] = useState("");

  // Is the active time filter one of the "more" options (dropdown-only)?
  const moreActive =
    timeFilter === "now" || timeFilter === "2hours" || timeFilter === "custom";

  const moreLabel = (() => {
    if (timeFilter === "custom" && dateRange) {
      if (dateRange.from === dateRange.to) {
        return fmtShort(dateRange.from);
      }
      return `${fmtShort(dateRange.from)} – ${fmtShort(dateRange.to)}`;
    }
    if (timeFilter === "now" || timeFilter === "2hours") {
      return TIME_LABELS[timeFilter];
    }
    return "More";
  })();

  function closeAll() {
    setDropdownOpen(false);
    setDatePickerOpen(false);
  }

  function handleOpenDatePicker() {
    setSelFrom(dateRange?.from || "");
    setSelTo(dateRange?.to || "");
    const now = new Date();
    setCalMonth(now.getMonth());
    setCalYear(now.getFullYear());
    setDatePickerOpen(true);
  }

  function handleDayClick(dateStr: string) {
    if (!selFrom || (selFrom && selTo)) {
      setSelFrom(dateStr);
      setSelTo("");
    } else {
      if (dateStr < selFrom) {
        setSelTo(selFrom);
        setSelFrom(dateStr);
      } else {
        setSelTo(dateStr);
      }
    }
  }

  function handleApply() {
    if (selFrom) {
      onDateRange({ from: selFrom, to: selTo || selFrom });
      onTimeChange("custom");
    }
    closeAll();
  }

  function prevMonth() {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear((y) => y - 1);
    } else {
      setCalMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear((y) => y + 1);
    } else {
      setCalMonth((m) => m + 1);
    }
  }

  const now = new Date();
  const canGoPrev =
    calYear > now.getFullYear() ||
    (calYear === now.getFullYear() && calMonth > now.getMonth());

  const timeChip = (active: boolean) =>
    `shrink-0 whitespace-nowrap text-[13px] px-4 py-2 rounded-full font-semibold border transition-all active:scale-95 select-none shadow-sm ${
      active
        ? "bg-gray-900 text-white border-gray-900"
        : "bg-white/95 text-gray-600 border-black/5"
    }`;

  return (
    <div className="absolute top-0 left-0 right-0 z-40 pointer-events-none">
      {/* Backdrop — closes dropdown on tap outside */}
      {(dropdownOpen || subDropdown) && (
        <div
          className="fixed inset-0 z-40 pointer-events-auto"
          onClick={() => { closeAll(); setSubDropdown(null); }}
        />
      )}

      {/* No backdrop-blur here: blurring over the WebGL map canvas forces a
          recomposite on every map frame and janks panning on mobile */}
      <div className="relative z-50 bg-gradient-to-b from-white/95 via-white/80 to-transparent pointer-events-auto pt-[env(safe-area-inset-top)] px-3 pb-4">
        {/* Time chips — like the landing mockup */}
        <div className="flex gap-2 mb-2 pt-2 overflow-x-auto scrollbar-hide -mx-0.5 px-0.5 py-0.5 items-center">
          {TIME_CHIP_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => {
                onTimeChange(opt);
                onDateRange(null);
                closeAll();
              }}
              className={timeChip(timeFilter === opt)}
            >
              {TIME_LABELS[opt]}
            </button>
          ))}

          {/* "More" chip — Right Now / Next 2h / custom dates */}
          <div className="relative shrink-0">
            <button
              onClick={() => {
                if (dropdownOpen) {
                  closeAll();
                } else {
                  setDropdownOpen(true);
                  setDatePickerOpen(false);
                }
              }}
              className={`${timeChip(moreActive)} flex items-center gap-1.5`}
            >
              {moreLabel}
              <svg
                className={`w-3 h-3 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* More options dropdown */}
            {dropdownOpen && !datePickerOpen && (
              <div className="absolute top-full left-0 mt-2 bg-white border border-gray-100 rounded-2xl py-2 min-w-[170px] shadow-lg z-50">
                {TIME_MORE_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      onTimeChange(opt);
                      onDateRange(null);
                      closeAll();
                    }}
                    className={`w-full text-left px-4 py-2.5 text-[13px] flex items-center justify-between active:bg-gray-50 transition ${
                      timeFilter === opt
                        ? "text-gray-900 font-semibold"
                        : "text-gray-500"
                    }`}
                  >
                    {TIME_LABELS[opt]}
                    {timeFilter === opt && (
                      <span className="text-emerald-500 font-bold">{"✓"}</span>
                    )}
                  </button>
                ))}
                <div className="h-px bg-gray-100 my-1.5" />
                <button
                  onClick={handleOpenDatePicker}
                  className={`w-full text-left px-4 py-2.5 text-[13px] flex items-center justify-between active:bg-gray-50 transition ${
                    timeFilter === "custom" ? "text-gray-900 font-semibold" : "text-gray-500"
                  }`}
                >
                  {"📅"} Choose dates
                  {timeFilter === "custom" && (
                    <span className="text-emerald-500 font-bold">{"✓"}</span>
                  )}
                </button>
              </div>
            )}

            {/* Date picker */}
            {dropdownOpen && datePickerOpen && (
              <div className="absolute top-full left-0 mt-2 bg-white border border-gray-100 rounded-2xl p-4 w-[300px] shadow-lg z-50">
                <div className="flex items-center justify-between mb-1">
                  <button
                    onClick={prevMonth}
                    disabled={!canGoPrev}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 active:bg-gray-100 disabled:text-gray-200 transition"
                  >
                    {"‹"}
                  </button>
                  <div />
                  <button
                    onClick={nextMonth}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 active:bg-gray-100 transition"
                  >
                    {"›"}
                  </button>
                </div>

                <MonthCalendar
                  year={calYear}
                  month={calMonth}
                  rangeFrom={selFrom}
                  rangeTo={selTo}
                  onDayClick={handleDayClick}
                />

                <div className="mt-3 pt-3 border-t border-gray-100">
                  {selFrom ? (
                    <p className="text-[12px] text-gray-500 text-center mb-3">
                      {fmtShort(selFrom)}
                      {selTo && selTo !== selFrom ? ` – ${fmtShort(selTo)}` : ""}
                      {!selTo && (
                        <span className="text-gray-400"> {"—"} tap end date</span>
                      )}
                    </p>
                  ) : (
                    <p className="text-[12px] text-gray-400 text-center mb-3">
                      Tap a start date
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDatePickerOpen(false)}
                      className="flex-1 text-[13px] py-2.5 rounded-xl bg-gray-100 text-gray-600 font-medium active:bg-gray-200 transition"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleApply}
                      disabled={!selFrom}
                      className="flex-1 text-[13px] py-2.5 rounded-xl bg-gray-900 text-white font-semibold active:bg-gray-700 transition disabled:opacity-30"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Category pills — neutral white until a category is selected */}
        <div className="relative" ref={pillsContainerRef}>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-0.5 px-0.5 py-0.5">
            {Object.entries(CATEGORIES).map(([key, cat]) => {
              const isSelected =
                activeCategories.size > 0 && activeCategories.has(key);
              const hasSubs = !!SUBCATEGORIES[key];
              const showingSub = activeSubtag && isSelected && activeCategories.size === 1;
              const subLabel = showingSub
                ? SUBCATEGORIES[key]?.find((s) => s.tag === activeSubtag)?.label
                : null;
              return (
                <div key={key} className="shrink-0 flex items-center">
                  <button
                    onClick={() => {
                      if (subDropdown) { setSubDropdown(null); return; }
                      onCategoryToggle(key);
                    }}
                    className={`whitespace-nowrap text-[13px] py-1.5 font-semibold transition-all active:scale-95 border select-none shadow-sm ${
                      hasSubs && isSelected ? "rounded-l-full pl-3 pr-1.5" : "rounded-full px-3"
                    } ${
                      isSelected
                        ? "text-white border-transparent"
                        : "bg-white/95 text-gray-600 border-black/5"
                    }`}
                    style={
                      isSelected
                        ? { background: cat.color, borderColor: cat.color }
                        : undefined
                    }
                  >
                    {cat.emoji} {subLabel || cat.label}
                  </button>
                  {hasSubs && isSelected && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (subDropdown === key) {
                          setSubDropdown(null);
                        } else {
                          // Align dropdown with the left edge of the pill
                          const pillDiv = e.currentTarget.parentElement;
                          const container = pillsContainerRef.current;
                          if (pillDiv && container) {
                            const pillRect = pillDiv.getBoundingClientRect();
                            const containerRect = container.getBoundingClientRect();
                            setSubDropdownLeft(pillRect.left - containerRect.left);
                          }
                          setSubDropdown(key);
                        }
                      }}
                      className="text-white text-[13px] py-1.5 pl-1 pr-2.5 rounded-r-full border-l border-white/20 active:opacity-70"
                      style={{ background: cat.color }}
                    >
                      ▾
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Subcategory dropdown — rendered outside overflow container */}
          {subDropdown && SUBCATEGORIES[subDropdown] && (
            <div className="absolute top-full mt-1.5 bg-white border border-gray-100 rounded-xl py-1 shadow-lg z-[101] pointer-events-auto" style={{ left: `${subDropdownLeft}px`, width: "auto", maxWidth: "160px" }}>
              {SUBCATEGORIES[subDropdown].map((sub) => {
                const isSelected = sub.tag === "" ? !activeSubtag : activeSubtag === sub.tag;
                return (
                  <button
                    key={sub.tag}
                    onClick={() => {
                      onSubtagSelect(subDropdown, sub.tag || null);
                      setSubDropdown(null);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-[12px] transition active:bg-gray-50 whitespace-nowrap ${
                      isSelected
                        ? "text-gray-900 font-semibold"
                        : "text-gray-500"
                    }`}
                  >
                    {sub.label}
                    {isSelected && (
                      <span className="ml-2 text-emerald-500 font-bold">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Centered event count pill — like the landing mockup */}
        <div className="flex justify-center mt-2.5">
          <span className="bg-white/95 border border-black/5 rounded-full px-3.5 py-1.5 text-[11px] font-semibold text-gray-500 shadow-sm tabular-nums">
            {eventCount} events
          </span>
        </div>
      </div>
    </div>
  );
}
