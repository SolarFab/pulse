import { createClient } from "@supabase/supabase-js";

// Server-side ANON client for the chat tools. Events + taxonomy are public data;
// per AGENTS.md rule 1 the service_role key must never sit on a user-request path.
export const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
);
