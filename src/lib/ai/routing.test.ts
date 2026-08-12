import { describe, expect, it } from "vitest";
import { routingFromEnv, withRouting } from "./routing";

describe("routingFromEnv", () => {
  it("defaults to fast fp8+ providers sorted by throughput", () => {
    expect(routingFromEnv({} as unknown as NodeJS.ProcessEnv)).toEqual({
      sort: "throughput",
      only: ["Cerebras", "DeepInfra", "Parasail", "SiliconFlow"],
      quantizations: ["fp8", "fp16", "bf16"],
      allow_fallbacks: true,
    });
  });

  it("is overridable without a deploy", () => {
    const r = routingFromEnv({
      OPENROUTER_SORT: "latency",
      OPENROUTER_PROVIDERS: "Cerebras",
      OPENROUTER_QUANTIZATIONS: "bf16, fp16",
    } as unknown as NodeJS.ProcessEnv);
    expect(r).toEqual({
      sort: "latency",
      only: ["Cerebras"],
      quantizations: ["bf16", "fp16"],
      allow_fallbacks: true,
    });
  });

  it("treats an empty provider list as no allowlist, not as an empty one", () => {
    // The escape hatch: if a named provider stops serving the model, this reopens
    // the full pool. An `only: []` would instead match nothing.
    const r = routingFromEnv({ OPENROUTER_PROVIDERS: "" } as unknown as NodeJS.ProcessEnv);
    expect(r.only).toBeUndefined();
  });

  it("never turns off fallbacks — routing must not be why a call fails", () => {
    expect(routingFromEnv({} as unknown as NodeJS.ProcessEnv).allow_fallbacks).toBe(true);
  });
});

describe("withRouting", () => {
  const routing = { sort: "throughput", quantizations: ["bf16"], allow_fallbacks: true };

  async function capture(body: BodyInit | null | undefined) {
    let seen: RequestInit | undefined;
    const spy = (async (_i: RequestInfo | URL, init?: RequestInit) => {
      seen = init;
      return new Response("{}");
    }) as unknown as typeof fetch;
    await withRouting(routing, spy)("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      body,
    });
    return seen;
  }

  it("adds the provider preference to the request body", async () => {
    const seen = await capture(JSON.stringify({ model: "google/gemma-4-31b-it", stream: true }));
    expect(JSON.parse(seen!.body as string)).toEqual({
      model: "google/gemma-4-31b-it",
      stream: true,
      provider: routing,
    });
  });

  it("keeps every field the SDK already set", async () => {
    const seen = await capture(JSON.stringify({ model: "m", tools: [{ a: 1 }], messages: [] }));
    const body = JSON.parse(seen!.body as string);
    expect(body.tools).toEqual([{ a: 1 }]);
    expect(body.messages).toEqual([]);
  });

  it("passes an unparseable body through untouched rather than failing the call", async () => {
    // A routing preference must never be the reason a model call breaks.
    const seen = await capture("not json");
    expect(seen!.body).toBe("not json");
  });

  it("leaves a bodyless request alone", async () => {
    const seen = await capture(undefined);
    expect(seen!.body).toBeUndefined();
  });
});
