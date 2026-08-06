import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { observe, startObservation } from "@langfuse/tracing";

const processor = new LangfuseSpanProcessor();
new NodeTracerProvider({ spanProcessors: [processor] }).register();

const handler = observe(async () => {
  const t0 = Date.now();
  // step 1: model decides to call the tool
  const g1 = startObservation("model-call-1 → search_events", {
    model: "google/gemma-4-31b-it",
    output: { tool_calls: ["search_events"] },
    usageDetails: { input: 1840, output: 62, total: 1902 },
    metadata: { step: 0, finish_reason: "tool-calls" },
  }, { asType: "generation", startTime: new Date(t0) });
  g1.end(new Date(t0 + 3110));

  // step 2: model writes the answer
  const g2 = startObservation("model-call-2", {
    model: "google/gemma-4-31b-it",
    output: "Here are my top picks for this weekend…",
    usageDetails: { input: 2600, output: 480, total: 3080 },
    metadata: { step: 1, finish_reason: "stop" },
  }, { asType: "generation", startTime: new Date(t0 + 4200) });
  g2.end(new Date(t0 + 13800));
  return "ok";
}, { name: "gen-probe2" });

await handler();
await processor.forceFlush();
console.log("flushed");
