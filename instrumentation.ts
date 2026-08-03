// Langfuse tracing (observability spec 1.1). Loaded by Next's instrumentation hook.
// Optional-guarded: without keys, no processor is registered and tracing is a no-op —
// tracing must never affect the user path.
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

export const langfuseSpanProcessor = process.env.LANGFUSE_PUBLIC_KEY
  ? new LangfuseSpanProcessor()
  : null;

export function register() {
  if (!langfuseSpanProcessor) return;
  const provider = new NodeTracerProvider({
    spanProcessors: [langfuseSpanProcessor],
  });
  provider.register();
}
