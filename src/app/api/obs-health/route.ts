// Temporary observability diagnostic (booleans only — no secret values).
import { startActiveObservation } from "@langfuse/tracing";
import { getLangfuseProcessor, register } from "../../../instrumentation";
register(); // ensure provider exists in THIS bundle too (prod bundles don't share modules)

export const dynamic = "force-dynamic";

export async function GET() {
  let traceId = "none";
  await startActiveObservation("obs-health", async (span) => {
    span.update({ input: "prod-ping", output: "prod-pong" });
    traceId = span.otelSpan.spanContext().traceId;
  });
  const _p = getLangfuseProcessor();
  if (_p) await _p.forceFlush();
  const pk = process.env.LANGFUSE_PUBLIC_KEY ?? "";
  return Response.json({
    pkPrefix: pk.slice(0, 12),           // public key prefix — must be "pk-lf"
    pkLen: pk.length,
    pkLastCharCode: pk.charCodeAt(pk.length - 1),  // 34=quote, 32=space, 10=newline
    skLen: (process.env.LANGFUSE_SECRET_KEY ?? "").length,
    baseUrl: process.env.LANGFUSE_BASE_URL ?? "(default)",
    hasPublicKey: !!process.env.LANGFUSE_PUBLIC_KEY,
    hasSecretKey: !!process.env.LANGFUSE_SECRET_KEY,
    processor: !!getLangfuseProcessor(),
    traceId,
  });
}
