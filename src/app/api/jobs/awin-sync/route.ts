import { after, NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AwinOrchestratorLockBusyError, runAwinCatalogSyncCycle } from "@/server/catalogSync/awinOrchestrator";
import { verifyAwinSyncSignature } from "@/server/jobs/awinSyncRequestAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BODY_BYTES = 128;

type AwinSyncRequestBody = {
  dryRun: boolean;
};

function isAwinSyncRequestBody(value: unknown): value is AwinSyncRequestBody {
  if (typeof value !== "object" || value === null) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === "dryRun" && typeof (value as { dryRun?: unknown }).dryRun === "boolean";
}

/**
 * Puente privado para que GitHub Actions solicite la sincronización dentro
 * de Hostinger. La base de datos nunca se expone fuera del hosting.
 *
 * GitHub firma timestamp + cuerpo con HMAC-SHA256 usando la clave de Awin.
 * La clave nunca viaja en la petición. `after()` permite responder 202 de
 * inmediato y continuar el trabajo en el proceso Node.js de Hostinger.
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.AWIN_DATAFEED_API_KEY?.trim();
  const feedListUrl = process.env.AWIN_DATAFEED_LIST_URL?.trim();
  if (!apiKey) {
    // Cerrado por defecto y sin revelar que la integración existe.
    return new NextResponse(null, { status: 404 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
    return NextResponse.json({ error: "Solicitud demasiado grande." }, { status: 413 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_REQUEST_BODY_BYTES) {
    return NextResponse.json({ error: "Solicitud demasiado grande." }, { status: 413 });
  }

  const authorized = verifyAwinSyncSignature({
    secret: apiKey,
    timestamp: request.headers.get("x-preciara-timestamp"),
    signature: request.headers.get("x-preciara-signature"),
    body: rawBody,
  });
  if (!authorized) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON no válido." }, { status: 400 });
  }
  if (!isAwinSyncRequestBody(payload)) {
    return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });
  }

  const { dryRun } = payload;
  after(async () => {
    try {
      const summary = await runAwinCatalogSyncCycle({ apiKey, feedListUrl, dryRun });
      console.log({
        event: "awin_sync_job_done",
        dryRun: summary.dryRun,
        ok: !summary.listFatalError && summary.feedsFailed === 0 && summary.advertisersIncomplete === 0,
        feedsDiscovered: summary.feedsDiscovered,
        feedsApproved: summary.feedsApproved,
        advertisersProcessed: summary.advertisersProcessed,
        validRowsTotal: summary.validRowsTotal,
        invalidRowsTotal: summary.invalidRowsTotal,
        feedsCompleted: summary.feedsCompleted,
        feedsFailed: summary.feedsFailed,
      });
    } catch (error) {
      console.error({
        event: error instanceof AwinOrchestratorLockBusyError ? "awin_sync_job_lock_busy" : "awin_sync_job_failed",
      });
    }
  });

  return NextResponse.json({ accepted: true, dryRun }, { status: 202 });
}
