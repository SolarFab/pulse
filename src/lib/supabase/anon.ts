import { createClient } from "@supabase/supabase-js";

// Server-side client with the PUBLIC anon key, for request paths that only read
// public data (events, venues, taxonomy). AGENTS.md rule 1: the service_role key
// must never sit on a user-request path — it bypasses RLS entirely, so any bug in
// a handler using it runs unscoped. admin.ts stays for server-only work that
// legitimately needs it (the authenticated flyer-scan write).
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
);
