// Query embedding via the same gateway + model as ingest (pipeline/embedder.py).
// MUST match events.embed_model — a silent mismatch would rank garbage, so the model id
// is pinned here and verified against the env override.
const EMBED_MODEL = process.env.EMBED_MODEL ?? "openai/text-embedding-3-small";

/** Returns pgvector text form '[…]' — or null on ANY failure (degrade to filter-only). */
export async function embedQuery(text: string): Promise<string | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, input: text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const vec: number[] | undefined = body?.data?.[0]?.embedding;
    if (!vec?.length) return null;
    return JSON.stringify(vec);
  } catch {
    return null; // degraded, not broken — search runs filter-only
  }
}
