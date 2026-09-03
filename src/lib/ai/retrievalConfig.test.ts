import { afterEach, describe, expect, it, vi } from "vitest";

const row = { current: null as Record<string, unknown> | null };
vi.mock("./anonClient", () => ({
  supabaseAnon: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row.current, error: null }) }) }),
    }),
  },
}));

afterEach(() => {
  row.current = null;
  delete process.env.EMBED_MODEL;
  delete process.env.EMBED_DIM;
});

async function load() {
  const m = await import("./retrievalConfig");
  return m.loadRetrievalConfig();
}

describe("the floor record", () => {
  it("fails closed when nothing is calibrated", async () => {
    expect(await load()).toMatchObject({ config: null, reason: "no_active_config" });
  });

  it("fails closed when the model differs", async () => {
    process.env.EMBED_MODEL = "model-b";
    row.current = { floor: 0.5, k: 3, embedding_model: "model-a", embedding_dim: 1536 };
    expect(await load()).toMatchObject({ config: null, reason: "model_mismatch" });
  });

  it("fails closed when the model is UNSET and the row is not the default", async () => {
    // Regression: an absent EMBED_MODEL used to skip validation entirely, so a
    // floor from another embedding space would have been trusted.
    row.current = { floor: 0.5, k: 3, embedding_model: "some-other-model", embedding_dim: 1536 };
    expect(await load()).toMatchObject({ config: null, reason: "model_mismatch" });
  });

  it("fails closed when the dimension differs", async () => {
    process.env.EMBED_MODEL = "m";
    process.env.EMBED_DIM = "768";
    row.current = { floor: 0.5, k: 3, embedding_model: "m", embedding_dim: 1536 };
    expect(await load()).toMatchObject({ config: null, reason: "dimension_mismatch" });
  });

  it("accepts a matching record", async () => {
    process.env.EMBED_MODEL = "m";
    row.current = { floor: 0.42, k: 3, embedding_model: "m", embedding_dim: 1536 };
    const { config, reason } = await load();
    expect(reason).toBe("calibrated");
    expect(config).toMatchObject({ floor: 0.42, k: 3 });
  });
});
