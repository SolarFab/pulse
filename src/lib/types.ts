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

export const SUBCATEGORIES: Record<string, { label: string; tag: string }[]> = {
  music: [
    { label: "All", tag: "" },
    { label: "Jazz & Blues", tag: "jazz-blues" },
    { label: "Electronic", tag: "electronic" },
    { label: "Classical", tag: "classical" },
    { label: "Rock & Pop", tag: "rock-pop" },
    { label: "Hip-Hop", tag: "hip-hop" },
    { label: "Live Concert", tag: "live-concert" },
    { label: "World & Folk", tag: "world-folk" },
    { label: "Latin", tag: "latin" },
  ],
  nightlife: [
    { label: "All", tag: "" },
    { label: "Club Night", tag: "club-night" },
    { label: "Bar Event", tag: "bar-event" },
    { label: "Party", tag: "party" },
    { label: "Comedy", tag: "comedy" },
    { label: "Karaoke", tag: "karaoke" },
  ],
  culture: [
    { label: "All", tag: "" },
    { label: "Exhibition", tag: "exhibition" },
    { label: "Theater", tag: "theater" },
    { label: "Cinema", tag: "cinema" },
    { label: "Reading", tag: "reading" },
    { label: "Gallery", tag: "gallery" },
    { label: "Festival", tag: "festival" },
  ],
  food: [
    { label: "All", tag: "" },
    { label: "Brunch", tag: "brunch" },
    { label: "Tasting", tag: "tasting" },
    { label: "Pop-up", tag: "pop-up" },
    { label: "Dining Event", tag: "dining-event" },
  ],
  markets: [
    { label: "All", tag: "" },
    { label: "Flea Market", tag: "flea-market" },
    { label: "Weekly Market", tag: "weekly-market" },
    { label: "Design Market", tag: "design-market" },
    { label: "Food Market", tag: "food-market" },
  ],
  workshops: [
    { label: "All", tag: "" },
    { label: "Creative Workshop", tag: "creative-workshop" },
    { label: "Language", tag: "language" },
    { label: "Digital Skills", tag: "digital-skills" },
    { label: "Dance Class", tag: "dance-class" },
    { label: "Craft", tag: "craft" },
  ],
  meetups: [
    { label: "All", tag: "" },
    { label: "Networking", tag: "networking" },
    { label: "Community", tag: "community" },
    { label: "Tech & Startup", tag: "tech-startup" },
    { label: "Talk / Panel", tag: "talk-panel" },
    { label: "Activism", tag: "activism" },
  ],
  outdoors: [
    { label: "All", tag: "" },
    { label: "Walking Tour", tag: "walking-tour" },
    { label: "Sports", tag: "sports" },
    { label: "Yoga & Fitness", tag: "yoga-fitness" },
    { label: "Bike Tour", tag: "bike-tour" },
    { label: "Outdoor Cinema", tag: "outdoor-cinema" },
  ],
  family: [
    { label: "All", tag: "" },
    { label: "Kids Program", tag: "kids-program" },
    { label: "Family Event", tag: "family-event" },
    { label: "Playground", tag: "playground" },
    { label: "Museum for Kids", tag: "museum-for-kids" },
  ],
};

export const CATEGORIES: Record<
  string,
  { emoji: string; color: string; label: string }
> = {
  music: { emoji: "\uD83C\uDFB5", color: "#e85d75", label: "Music" },
  nightlife: { emoji: "\uD83C\uDF19", color: "#8b5cf6", label: "Nightlife" },
  culture: { emoji: "\uD83C\uDFA8", color: "#06b6d4", label: "Culture" },
  food: { emoji: "\uD83C\uDF5C", color: "#f59e0b", label: "Food" },
  markets: { emoji: "\uD83D\uDECD\uFE0F", color: "#1e3a5f", label: "Markets" },
  workshops: { emoji: "\uD83D\uDEE0\uFE0F", color: "#10b981", label: "Workshops" },
  meetups: { emoji: "\uD83E\uDD1D", color: "#f97316", label: "Meetups" },
  outdoors: { emoji: "\uD83C\uDF33", color: "#22c55e", label: "Outdoors" },
  family: { emoji: "\uD83D\uDC76", color: "#ec4899", label: "Family" },
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
