"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { CATEGORIES, TimeFilter, TIME_LABELS } from "@/lib/types";

export interface DateRange {
  from: string;
  to: string;
}

export type PriceFilter = "all" | "free" | "under15" | "under30";

interface Props {
  timeFilter: TimeFilter;
  activeCategories: Set<string>;
  onTimeChange: (t: TimeFilter) => void;
  onCategoryToggle: (cat: string) => void;
  eventCount: number;
  dateRange: DateRange | null;
  onDateRange: (range: DateRange | null) => void;
  priceFilter: PriceFilter;
  onPriceChange: (p: PriceFilter) => void;
  venueSearch: string;
  onVenueSearch: (v: string) => void;
}

const TIME_OPTIONS: TimeFilter[] = [
  "now",
  "2hours",
  "tonight",
  "today",
  "tomorrow",
  "weekend",
];

const PRICE_OPTIONS: { value: PriceFilter; label: string }[] = [
  { value: "all", label: "Any price" },
  { value: "free", label: "Free" },
  { value: "under15", label: "Under 15\u20AC" },
  { value: "under30", label: "Under 30\u20AC" },
];

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
  onTimeChange,
  onCategoryToggle,
  eventCount,
  dateRange,
  onDateRange,
  priceFilter,
  onPriceChange,
  venueSearch,
  onVenueSearch,
}: Props) {
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showPriceDropdown, setShowPriceDropdown] = useState(false);
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [selFrom, setSelFrom] = useState("");
  const [selTo, setSelTo] = useState("");
  const [showVenueInput, setShowVenueInput] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const priceRef = useRef<HTMLDivElement>(null);
  const venueInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!showTimeDropdown && !showPriceDropdown) return;
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowTimeDropdown(false);
        setShowDatePicker(false);
      }
      if (
        priceRef.current &&
        !priceRef.current.contains(e.target as Node)
      ) {
        setShowPriceDropdown(false);
      }
    }
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [showTimeDropdown, showPriceDropdown]);

  useEffect(() => {
    if (showVenueInput) venueInputRef.current?.focus();
  }, [showVenueInput]);

  const activeLabel = (() => {
    if (timeFilter === "custom" && dateRange) {
      if (dateRange.from === dateRange.to) {
        return fmtShort(dateRange.from);
      }
      return `${fmtShort(dateRange.from)} \u2013 ${fmtShort(dateRange.to)}`;
    }
    return TIME_LABELS[timeFilter] || "Today";
  })();

  const priceLabel = PRICE_OPTIONS.find((p) => p.value === priceFilter)?.label || "Any price";

  function handleOpenDatePicker() {
    setSelFrom(dateRange?.from || "");
    setSelTo(dateRange?.to || "");
    const now = new Date();
    setCalMonth(now.getMonth());
    setCalYear(now.getFullYear());
    setShowDatePicker(true);
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
    setShowDatePicker(false);
    setShowTimeDropdown(false);
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

  // Count active filters for badge
  const activeFilterCount =
    (priceFilter !== "all" ? 1 : 0) +
    (venueSearch ? 1 : 0) +
    (activeCategories.size > 0 ? 1 : 0);

  return (
    <div className="absolute top-0 left-0 right-0 z-40 pointer-events-none">
      <div className="bg-gradient-to-b from-white/90 via-white/70 to-transparent backdrop-blur-sm pointer-events-auto pt-[env(safe-area-inset-top)] px-3 pb-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-2.5 px-0.5 pt-2">
          <h1 className="text-lg font-extrabold text-gray-900 tracking-tight">
            Whatsupp
          </h1>
          <span className="text-xs text-gray-400 tabular-nums font-medium">
            {eventCount} events
          </span>
        </div>

        {/* Filter row: time + price + venue */}
        <div className="flex gap-2 mb-2.5 overflow-x-auto scrollbar-hide">
          {/* Time selector */}
          <div className="relative shrink-0" ref={dropdownRef}>
            <button
              onClick={() => {
                setShowTimeDropdown((v) => !v);
                setShowDatePicker(false);
                setShowPriceDropdown(false);
              }}
              className="flex items-center gap-1.5 text-[13px] px-4 py-2.5 rounded-full font-semibold bg-gray-900 text-white shadow-sm active:scale-95 transition-transform"
            >
              {activeLabel}
              <svg
                className={`w-3 h-3 transition-transform ${showTimeDropdown ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showTimeDropdown && !showDatePicker && (
              <div className="absolute top-full left-0 mt-2 bg-white border border-gray-100 rounded-2xl py-2 min-w-[170px] shadow-lg z-50">
                {TIME_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      onTimeChange(opt);
                      onDateRange(null);
                      setShowTimeDropdown(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-[13px] flex items-center justify-between active:bg-gray-50 transition ${
                      timeFilter === opt && timeFilter !== "custom"
                        ? "text-gray-900 font-semibold"
                        : "text-gray-500"
                    }`}
                  >
                    {TIME_LABELS[opt]}
                    {timeFilter === opt && timeFilter !== "custom" && (
                      <span className="text-emerald-500 font-bold">{"\u2713"}</span>
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
                  {"\uD83D\uDCC5"} Choose dates
                  {timeFilter === "custom" && (
                    <span className="text-emerald-500 font-bold">{"\u2713"}</span>
                  )}
                </button>
              </div>
            )}

            {showTimeDropdown && showDatePicker && (
              <div className="absolute top-full left-0 mt-2 bg-white border border-gray-100 rounded-2xl p-4 w-[300px] shadow-lg z-50">
                <div className="flex items-center justify-between mb-1">
                  <button
                    onClick={prevMonth}
                    disabled={!canGoPrev}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 active:bg-gray-100 disabled:text-gray-200 transition"
                  >
                    {"\u2039"}
                  </button>
                  <div />
                  <button
                    onClick={nextMonth}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 active:bg-gray-100 transition"
                  >
                    {"\u203A"}
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
                      {selTo && selTo !== selFrom ? ` \u2013 ${fmtShort(selTo)}` : ""}
                      {!selTo && (
                        <span className="text-gray-400"> {"\u2014"} tap end date</span>
                      )}
                    </p>
                  ) : (
                    <p className="text-[12px] text-gray-400 text-center mb-3">
                      Tap a start date
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowDatePicker(false)}
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

          {/* Price filter */}
          <div className="relative shrink-0" ref={priceRef}>
            <button
              onClick={() => {
                setShowPriceDropdown((v) => !v);
                setShowTimeDropdown(false);
              }}
              className={`flex items-center gap-1.5 text-[13px] px-3.5 py-2.5 rounded-full font-medium transition-all active:scale-95 ${
                priceFilter !== "all"
                  ? "bg-gray-900 text-white"
                  : "bg-white border border-gray-200 text-gray-600"
              }`}
            >
              {priceFilter === "all" ? "Price" : priceLabel}
              <svg
                className={`w-3 h-3 transition-transform ${showPriceDropdown ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showPriceDropdown && (
              <div className="absolute top-full left-0 mt-2 bg-white border border-gray-100 rounded-2xl py-2 min-w-[150px] shadow-lg z-50">
                {PRICE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      onPriceChange(opt.value);
                      setShowPriceDropdown(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-[13px] flex items-center justify-between active:bg-gray-50 transition ${
                      priceFilter === opt.value ? "text-gray-900 font-semibold" : "text-gray-500"
                    }`}
                  >
                    {opt.label}
                    {priceFilter === opt.value && (
                      <span className="text-emerald-500 font-bold">{"\u2713"}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Venue search */}
          <div className="shrink-0">
            {showVenueInput ? (
              <div className="flex items-center gap-1.5">
                <input
                  ref={venueInputRef}
                  type="text"
                  value={venueSearch}
                  onChange={(e) => onVenueSearch(e.target.value)}
                  placeholder="Venue name..."
                  className="text-[13px] px-3.5 py-2 rounded-full border border-gray-200 bg-white w-36 focus:outline-none focus:ring-2 focus:ring-black/10"
                />
                <button
                  onClick={() => {
                    onVenueSearch("");
                    setShowVenueInput(false);
                  }}
                  className="text-gray-400 text-lg leading-none px-1"
                >
                  {"\u00D7"}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowVenueInput(true)}
                className={`flex items-center gap-1.5 text-[13px] px-3.5 py-2.5 rounded-full font-medium transition-all active:scale-95 ${
                  venueSearch
                    ? "bg-gray-900 text-white"
                    : "bg-white border border-gray-200 text-gray-600"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                {venueSearch || "Venue"}
              </button>
            )}
          </div>
        </div>

        {/* Active filter chips */}
        {activeFilterCount > 0 && (
          <div className="flex gap-1.5 mb-2 overflow-x-auto scrollbar-hide">
            {priceFilter !== "all" && (
              <button
                onClick={() => onPriceChange("all")}
                className="text-[11px] px-2.5 py-1 rounded-full bg-gray-900 text-white font-medium flex items-center gap-1"
              >
                {priceLabel} {"\u00D7"}
              </button>
            )}
            {venueSearch && (
              <button
                onClick={() => { onVenueSearch(""); setShowVenueInput(false); }}
                className="text-[11px] px-2.5 py-1 rounded-full bg-gray-900 text-white font-medium flex items-center gap-1"
              >
                {venueSearch} {"\u00D7"}
              </button>
            )}
          </div>
        )}

        {/* Category pills */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-0.5 px-0.5">
          {Object.entries(CATEGORIES).map(([key, cat]) => {
            const isActive =
              activeCategories.size === 0 || activeCategories.has(key);
            return (
              <button
                key={key}
                onClick={() => onCategoryToggle(key)}
                className={`whitespace-nowrap text-[13px] px-3 py-1.5 rounded-full font-medium transition-all active:scale-95 border ${
                  isActive
                    ? "text-white border-transparent shadow-sm"
                    : "bg-white/80 text-gray-400 border-gray-100"
                }`}
                style={
                  isActive
                    ? { background: cat.color, borderColor: cat.color }
                    : undefined
                }
              >
                {cat.emoji} {cat.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
