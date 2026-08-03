// Temporary observability diagnostic (booleans only — no secret values).
import { startActiveObservation } from "@langfuse/tracing";
import { langfuseSpanProcessor } from "../../../instrumentation";

export const dynamic = "force-dynamic";

export async function GET() {
  let traceId = "none";
  await startActiveObservation("obs-health", async (span) => {
    span.update({ input: "prod-ping", output: "prod-pong" });
    traceId = span.otelSpan.spanContext().traceId;
  });
  if (langfuseSpanProcessor) await langfuseSpanProcessor.forceFlush();
  return Response.json({
    hasPublicKey: !!process.env.LANGFUSE_PUBLIC_KEY,
    hasSecretKey: !!process.env.LANGFUSE_SECRET_KEY,
    processor: !!langfuseSpanProcessor,
    traceId,
  });
}
