import { supabaseAnon } from "./anonClient";
import type { FloorConfig } from "./relax";

/**
 * The one active retrieval_config row (FEAT-25, finding 3).
 *
 * Read in a single statement so a reader can never observe a half-applied
 * calibration, and validated against the embedding model actually configured
 * here. A floor calibrated for one model means nothing under another — cosine
 * scores are not comparable across embedding spaces — so a mismatch returns
 * null and the ladder runs unrelaxed rather than trusting a foreign number.
 *
 * Absent config is not an error state. It is the honest one: nobody has
 * calibrated yet, so we do not pretend to know what "relevant" means.
 */
export async function loadRetrievalConfig(): Promise<{ config: FloorConfig; reason: string }> {
  const model = process.env.EMBED_MODEL ?? "";
  const dim = Number(process.env.EMBED_DIM ?? 1536);

  const { data, error } = await supabaseAnon
    .from("retrieval_config")
    .select("floor,k,embedding_model,embedding_dim")
    .eq("active", true)
    .maybeSingle();

  if (error || !data) return { config: null, reason: "no_active_config" };
  if (model && data.embedding_model !== model)
    return { config: null, reason: "model_mismatch" };
  if (data.embedding_dim !== dim) return { config: null, reason: "dimension_mismatch" };

  return {
    config: {
      floor: data.floor,
      k: data.k,
      embedding_model: data.embedding_model,
      embedding_dim: data.embedding_dim,
    },
    reason: "calibrated",
  };
}
