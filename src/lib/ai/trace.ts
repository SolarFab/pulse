// Relative, not "@/": the vitest config does not resolve that alias, and these
// tools are unit-tested without a Next runtime.
import { getTracer } from "../../instrumentation";

/**
 * Wrap one step of a concierge turn in its own observation.
 *
 * The AI SDK traces the model calls and the tool calls, but a tool call is one
 * opaque box — and most of a slow turn hides inside it. `search_events` alone makes
 * two network round-trips (embed the query, then the vector search), and without
 * these spans a 44-second turn is a single number with nowhere to look.
 *
 * Deliberately no-ops when tracing is off, and never changes the result or the
 * error: instrumentation that can alter behaviour is worse than none.
 */
export async function step<T>(
  name: string,
  opts: { type?: "span" | "retriever" | "embedding" | "tool"; input?: unknown },
  fn: () => PromiseLike<T>,
): Promise<{ value: T; ms: number }> {
  const t0 = Date.now();
  const tracer = getTracer();
  if (!tracer) {
    const value = await fn();
    return { value, ms: Date.now() - t0 };
  }
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttribute("langfuse.observation.type", opts.type ?? "span");
    if (opts.input !== undefined) {
      span.setAttribute("langfuse.observation.input", safe(opts.input));
    }
    try {
      const value = await fn();
      const ms = Date.now() - t0;
      span.setAttribute("langfuse.observation.output", safe(summarise(value)));
      span.setAttribute("duration_ms", ms);
      return { value, ms };
    } catch (err) {
      span.setAttribute("langfuse.observation.level", "ERROR");
      span.setAttribute("langfuse.observation.status_message", String(err).slice(0, 300));
      throw err;
    } finally {
      span.end();
    }
  });
}

/** Row payloads are large and mostly noise in a trace — record shape, not contents. */
function summarise(v: unknown): unknown {
  if (Array.isArray(v)) return { count: v.length };
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.data)) return { rows: (o.data as unknown[]).length, error: o.error ?? null };
    if (typeof o.length === "number") return { length: o.length };
  }
  return v;
}

function safe(v: unknown): string {
  try {
    return JSON.stringify(v).slice(0, 900);
  } catch {
    return String(v).slice(0, 300);
  }
}
