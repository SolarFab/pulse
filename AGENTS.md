# AGENTS.md — Pulse web

Always-on conventions for AI agents (and humans) working in this repo. Read this first.

## What this is
The user-facing half of **Pulse**, an event-discovery app for Berlin: an interactive map of
concerts, markets, nightlife, kids events and pop-ups, plus an AI concierge you ask in natural
language. Internal/legacy name: **NachtKarte**.

**Next.js 16 (App Router, TypeScript)**, deployed on Vercel.

## Repo boundary — important
This is its own git repository (`SolarFab/nachtkarte`). It is checked out *inside* the pipeline
repo's working tree at `web/`, and `nachtkarte-pipeline` gitignores that path. Commits, branches
and PRs here go to **this** remote. Nothing here is staged from the parent directory.

Living in the other repo (`SolarFab/nachtkarte-pipeline`): the Python scraping pipeline, the
database schema and migrations, `deploy/`, and the OpenSpec change docs. A feature that spans both
is two PRs.

## Layout
- `src/app/` — App Router pages (`map`, `login`, `signup`, `auth`, `impressum`, `datenschutz`, …)
- `src/app/api/` — `chat`, `events`, `events/search`, `events/scan`, `health`
- `src/lib/ai/` — model routing and tool definitions
- `src/lib/supabase/` — database clients
- `src/components/`

## Commands
`npm run dev` · `npm run build` · `npm run lint` (eslint) · `npm test` (vitest).

## Non-negotiable rules (load-bearing)
These govern code in **this** repo, even though the pipeline repo states them too.

1. **RLS + anon key for per-user data.** All per-user tables (`profiles`, `user_events`,
   `interested_venues`, and any taste/interaction tables) MUST be read/written through the Supabase
   **anon key + the user's JWT** so Row Level Security scopes rows to `auth.uid()`. The
   **`service_role` key is server-only** and MUST NOT appear on a user-request path — it bypasses
   RLS entirely.
2. **Scraped text is untrusted → indirect prompt injection.** Event descriptions come from scraped
   web pages. Where they enter a prompt (the concierge context above all), **delimit** them clearly,
   treat them as data and not instructions, and harden the system prompt against override. Never let
   retrieved text carry the authority of a system instruction.
3. **Model-agnostic LLM access.** Route model calls through the Vercel AI SDK, keep prompts in
   versioned files, keep embeddings swappable. Don't hardcode a provider deep in app code.
4. **Privacy (GDPR).** Person-level user data (including taste/preference data) stays internal and
   is deletable on account deletion. Only aggregated signals are shareable.

Reason about changes against the **OWASP LLM Top 10**: LLM01 prompt injection (rule 2),
LLM02 sensitive-info disclosure (rule 1).

## Delivery pipeline
Every change is a card on the Notion **Pulse Delivery** board with an ID like `FEAT-12`, and its
`Repo` is `nachtkarte`. Put the ID in the branch (`feat/FEAT-12-slug`), the PR title and the commits.

**Ownership** — whoever produces an artifact never grades it.
**Fabian** owns 1 Ready and 8 Deployment · **Claude** writes: 2 Spec, 5 Development,
7 Verification, 10 Closed · **Codex** reviews: 3 Spec Review, 4 Architecture, 6 Review.

GitHub derives phases 5–8 from PR events (`.github/workflows/notion-sync.yml`) — **never set those
by hand.** Everything else is written by whoever owns the phase, and the phase string must match the
board exactly, `·` included.

At intake tick **`Touches web`** (always true here) and **`Touches LLM`** — any model call, prompt
or embedding, which covers the chat and scan routes. `Touches LLM` pulls Langfuse in from phase 2,
because an acceptance criterion nobody can observe cannot be verified.

See the `pulse-delivery` skill for the full contract.

## Don'ts
- Don't use the `service_role` key on a user-request path.
- Don't pass raw scraped text to a model as if it were trusted instructions.
- Don't commit secrets or `.env`.
- Don't try to stage files under `web/` from the pipeline repo — they belong to this one.
