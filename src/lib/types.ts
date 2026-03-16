export interface Event {
  id: string;
  title: string;
  venue_name: string;
  lat: number | null;
  lng: number | null;
  neighborhood: string | null;
  address: string | null;
  start_time: string;
  end_time: string | null;
  category: string;
  subcategory: string | null;
  tags: string[] | null;
  description: string | null;
  price: string | null;
  image_url: string | null;
  source: string;
  source_url: string | null;
}

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  genres: string[];
  onboarding_completed: boolean;
}

export const CATEGORIES: Record<
  string,
  { emoji: string; color: string; label: string }
> = {
  music: { emoji: "\uD83C\uDFB5", color: "#e85d75", label: "Music" },
  nightlife: { emoji: "\uD83C\uDF19", color: "#8b5cf6", label: "Nightlife" },
  food: { emoji: "\uD83C\uDF5C", color: "#f59e0b", label: "Food & Drink" },
  culture: { emoji: "\uD83C\uDFA8", color: "#06b6d4", label: "Culture & Art" },
  entertainment: { emoji: "\uD83C\uDFAD", color: "#ec4899", label: "Entertainment" },
  wellness: { emoji: "\uD83E\uDDD8", color: "#10b981", label: "Wellness" },
  social: { emoji: "\uD83C\uDFAF", color: "#f97316", label: "Social" },
  market: { emoji: "\uD83D\uDECD\uFE0F", color: "#1e3a5f", label: "Markets" },
};

export type TimeFilter =
  | "now"
  | "2hours"
  | "tonight"
  | "today"
  | "tomorrow"
  | "weekend"
  | "custom";

export const TIME_LABELS: Record<string, string> = {
  now: "Right Now",
  "2hours": "Next 2h",
  tonight: "Tonight",
  today: "Today",
  tomorrow: "Tomorrow",
  weekend: "Weekend",
  custom: "Pick Date",
};
