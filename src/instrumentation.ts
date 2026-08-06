// Langfuse tracing (observability spec 1.1). Next runs register() per server/lambda start.
// The processor lives on globalThis: in production, route bundles and the instrumentation
// bundle each get their own module copy — without the global, routes would flush an empty
// duplicate while real spans die in the registered instance's batch queue.
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import type { Tracer } from "@opentelemetry/api";

type G = typeof globalThis & {
  __lfProcessor?: LangfuseSpanProcessor | null;
  __lfProvider?: NodeTracerProvider | null;
};
const g = globalThis as G;

export function getLangfuseProcessor(): LangfuseSpanProcessor | null {
  if (g.__lfProcessor === undefined) {
    g.__lfProcessor = process.env.LANGFUSE_PUBLIC_KEY ? new LangfuseSpanProcessor() : null;
  }
  return g.__lfProcessor;
}

/** The provider itself, kept on globalThis so every bundle shares ONE instance. */
function getProvider(): NodeTracerProvider | null {
  if (g.__lfProvider === undefined) {
    const processor = getLangfuseProcessor();
    if (!processor) {
      g.__lfProvider = null;
    } else {
      const provider = new NodeTracerProvider({ spanProcessors: [processor] });
      provider.register(); // still set the global, for anything that resolves it that way
      g.__lfProvider = provider;
    }
  }
  return g.__lfProvider ?? null;
}

export function register() {
  getProvider();
}

/**
 * A tracer taken DIRECTLY from our provider.
 *
 * Why not let the AI SDK resolve one itself: `provider.register()` sets the global
 * tracer on the copy of `@opentelemetry/api` inside whichever bundle called it. In a
 * production Next build the route handler is a separate bundle with its OWN copy of
 * that module, whose global was never set — so the AI SDK asked for a tracer, got a
 * no-op, and every generation and tool span vanished. The root span survived only
 * because it is created through @langfuse/tracing directly.
 *
 * Handing the tracer over explicitly removes the global registry from the path.
 */
export function getTracer(): Tracer | undefined {
  return getProvider()?.getTracer("pulse-concierge") ?? undefined;
}
