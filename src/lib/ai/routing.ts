// OpenRouter serves one model id from 19 different providers and, by default, picks
// freely among them. That default is the largest single source of tail latency in a
// concierge turn, and a silent source of quality drift.
//
// WHY THE TAIL AND NOT THE MEDIAN. Production traces (Langfuse, 13 turns) showed a
// median of 19.5s and a p90 of 34.5s, with the final generation accounting for
// 72-84% of a turn and its time-to-first-token swinging from 2.0s to 14.4s on the
// SAME model. A 35-second answer is not a slow answer, it is a broken one.
//
// MEASURED, head to head, configs interleaved round-robin so that OpenRouter's own
// load drift hits both equally (a first attempt ran each config in a block and
// produced garbage: 250s for one, 29s for a config that normally returns in 1.4s):
//
//                             TTFT p90   total p90   total max
//     default routing            4.24s      23.80s      31.78s
//     this config                2.83s      17.45s      20.31s
//
// Medians were a wash in that window (12.3s vs 12.7s); in an earlier interleaved
// run throughput routing beat the default 3.2s vs 19.0s. So the honest claim is:
// the tail improves consistently, the median improves in some windows and not in
// others. Absolute numbers are not comparable across windows — only within a run.
//
// WHY AN EXPLICIT PROVIDER LIST rather than `sort: "throughput"` alone. A
// quantization floor on its own cost 3x speed (9.9s vs 3.2s median), because it
// keeps slow bf16 providers (Venice, CoreWeave) in the pool while dropping the
// fastest. Naming the providers that are fast AND fp8-or-better gives both: head to
// head it matched or beat unconstrained throughput routing on every metric.
//
// WHY QUANTIZATION AT ALL — this is a correctness knob, not a performance one. The
// same model id is served at anything from fp4 (DeepInfra, Chutes, Morph, ModelRun)
// to bf16 (CoreWeave, Venice, OpenInference), and the default router mixes them
// freely. Production answer quality therefore varied per request, invisibly, and no
// longer matched what the stage-2 model evaluation measured. NOTE: the fp4-vs-fp8
// quality difference for this task has not itself been measured — pinning the floor
// makes the eval reproducible; it does not prove fp4 was worse.
//
// `allow_fallbacks` stays on: a routing preference must never be why a call fails.
// This configures the GATEWAY's routing, not a provider SDK, so model-agnostic
// access (AGENTS.md rule 3) is intact. Every knob is env-overridable.

export type OpenRouterRouting = {
  sort: string;
  only?: string[];
  quantizations: string[];
  allow_fallbacks: boolean;
};

const DEFAULT_PROVIDERS = "Cerebras,DeepInfra,Parasail,SiliconFlow";
const DEFAULT_QUANTIZATIONS = "fp8,fp16,bf16";

function list(value: string): string[] {
  return value.split(",").map((v) => v.trim()).filter(Boolean);
}

export function routingFromEnv(env: NodeJS.ProcessEnv = process.env): OpenRouterRouting {
  // An empty OPENROUTER_PROVIDERS means "no allowlist" — the escape hatch for when
  // a named provider stops serving the model and we want the open pool back.
  const only = list(env.OPENROUTER_PROVIDERS ?? DEFAULT_PROVIDERS);
  return {
    sort: env.OPENROUTER_SORT ?? "throughput",
    ...(only.length ? { only } : {}),
    quantizations: list(env.OPENROUTER_QUANTIZATIONS ?? DEFAULT_QUANTIZATIONS),
    allow_fallbacks: true,
  };
}

/**
 * @ai-sdk/openai exposes no `extraBody`, so the routing preference is added in a
 * fetch middleware — the one place every model call on this gateway passes through.
 *
 * A body we cannot parse is a body we must not rewrite: the request goes through
 * untouched rather than failing over a routing preference.
 */
export function withRouting(
  routing: OpenRouterRouting,
  baseFetch: typeof fetch = fetch
): typeof fetch {
  return async (input, init) => {
    if (init?.body && typeof init.body === "string") {
      try {
        const parsed = JSON.parse(init.body);
        init = { ...init, body: JSON.stringify({ ...parsed, provider: routing }) };
      } catch {
        // leave it alone
      }
    }
    return baseFetch(input, init);
  };
}
