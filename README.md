# NachtKarte — Web

Frontend for [NachtKarte](https://event-map-ten.vercel.app), an AI-powered real-time event discovery map for Berlin. Events from 21+ sources on a dark interactive map, with natural-language search and a flyer scanner.

The data pipeline (scrapers, categorization, geocoding) lives in [`nachtkarte-pipeline`](https://github.com/SolarFab/nachtkarte-pipeline).

## Features

- **Interactive map** — MapLibre GL, emoji pins (white disc + category ring) generated on canvas, clustering
- **AI chat concierge** — ask "best jazz tonight?" in natural language; recommended events get highlighted on the map (Claude Haiku)
- **Flyer scanner** — photograph a street flyer, Claude Vision extracts title, venue, date, and price into a structured event
- **Filters** — time (Right Now / Tonight / Tomorrow / Weekend) × 9 categories
- **Accounts** — Supabase Auth (email + Google OAuth), bookmarks, taste profiles that learn from queries

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS · MapLibre GL · Supabase (Postgres + PostGIS, Auth) · Anthropic API

## Structure

```
src/
├── app/          # pages and API routes
├── components/   # map, filters, chat panel, event cards
├── lib/          # Supabase clients (browser / server / admin), bookmarks, types
└── middleware.ts # auth/session handling
```

## Run locally

```bash
npm install
npm run dev
```

`.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_KEY=<your-service-key>
ANTHROPIC_API_KEY=<your-api-key>
```

## License

All rights reserved.
