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

/** A tracer from our provider, for spans we create ourselves. */
export function getTracer(): Tracer | undefined {
  return getProvider()?.getTracer("pulse-concierge") ?? undefined;
}

/**
 * Bind our provider to the caller's OWN copy of `@opentelemetry/api`.
 *
 * The AI SDK (v7) has no `tracer` option — it resolves a tracer from the global
 * registry, full stop. And `provider.register()` sets that global on the copy of
 * `@opentelemetry/api` reachable from *this* module. In a production Next build the
 * route handler is a separate bundle that may resolve a different copy, whose global
 * was never set: the SDK then gets a no-op tracer and every generation and tool span
 * is silently dropped. The root span survives, because @langfuse/tracing creates it
 * directly — which is exactly why this looked like partial success.
 *
 * So the route passes in the `trace` object it imported itself, and we set the global
 * on that one. Returns whether a provider was bound, for a startup log.
 */
export function bindGlobalTracer(api: {
  setGlobalTracerProvider: (p: never) => boolean;
}): boolean {
  const provider = getProvider();
  if (!provider) return false;
  // Returns false if a provider is already registered on that copy — which is a
  // success for us, not a failure: something is already there to receive spans.
  api.setGlobalTracerProvider(provider as never);
  return true;
}
