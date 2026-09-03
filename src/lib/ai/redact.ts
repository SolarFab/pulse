import { createHash } from "node:crypto";

/**
 * What may enter a trace (FEAT-25).
 *
 * Traces are a second data store. Under AGENTS.md rule 4 person-level data stays
 * internal and deletable, and a free-text query is person-level — people type
 * where they live, who they are going with, what they can afford. "Arguments as
 * sent" would have quietly made Langfuse a home for all of it.
 *
 * Structured arguments are recorded verbatim: they are enum-like, they are what
 * routing decisions are made from, and a trace without them cannot explain why a
 * rung fired.
 */
// Read per call, not at import: a module-level constant freezes the value before
// any test or deploy-time config can set it, and both branches then become
// untestable — the exact shape of bug this file exists to prevent.
const salt = () => process.env.TRACE_QUERY_SALT ?? "";
const allowRaw = () =>
  process.env.TRACE_RAW_QUERIES === "1" && process.env.NODE_ENV !== "production";

/** Latin vs non-Latin and a few German markers — enough to spot a language skew. */
function detectLanguage(s: string): string {
  if (/[äöüß]/i.test(s) || /\b(und|oder|heute|morgen|kostenlos|mit|für)\b/i.test(s)) return "de";
  if (/^[\x20-\x7E]*$/.test(s)) return "en";
  return "other";
}

export type QueryFingerprint = {
  query_sha256: string;
  query_len: number;
  query_lang: string;
  /** Only ever populated outside production, behind an explicit flag. */
  query_raw?: string;
};

/**
 * A query as it may be traced: a salted hash, its length, its language.
 *
 * The hash makes two attempts in one session comparable — which is the whole
 * diagnostic need — without the text being recoverable. An unsalted hash would
 * be trivially reversible for short queries, so an unset salt is treated as a
 * missing secret and the hash is withheld rather than published weak.
 */
export function fingerprintQuery(query: string | null | undefined): QueryFingerprint | null {
  if (!query) return null;
  return {
    query_sha256: salt()
      ? createHash("sha256").update(salt() + query).digest("hex").slice(0, 32)
      : "unsalted",
    query_len: query.length,
    query_lang: detectLanguage(query),
    ...(allowRaw() ? { query_raw: query } : {}),
  };
}

/**
 * Fields that must never reach a span, whatever a caller passes.
 *
 * Matched as a SUBSTRING, not anchored. An anchored `^key$` let `apiKey` and
 * `authToken` through untouched — and the credential test passed anyway, because
 * it listed `apiKey` in the input and then never asserted on it. A test that
 * looks like it covers credentials and does not is worse than no test at all.
 */
const FORBIDDEN = /(description|body|content|embedding|vector|token|key|secret|password|credential|auth|email|phone)/i;

/**
 * Strip anything not fit for a trace: scraped descriptions (they may carry
 * injected instructions, AGENTS.md rule 2, and bloat every span), credentials,
 * and raw embedding vectors.
 */
export function safeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (FORBIDDEN.test(k)) continue;
    if (k === "query" && typeof v === "string") {
      Object.assign(out, fingerprintQuery(v));
      continue;
    }
    if (Array.isArray(v) && v.length > 20) {
      out[k] = { length: v.length };
      continue;
    }
    out[k] = v;
  }
  return out;
}
