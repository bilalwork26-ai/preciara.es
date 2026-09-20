import { withDb } from "@/server/db/client";
import type { ImportStatus } from "@/generated/prisma";

export type ImportRunRow = {
  id: number;
  source: string;
  status: ImportStatus;
  startedAt: Date;
  finishedAt: Date | null;
  rowsRead: number;
  productsCreated: number;
  productsUpdated: number;
  offersCreated: number;
  offersUpdated: number;
  rowsRejected: number;
  errorSummary: string | null;
};

/** Últimas ejecuciones del importador, más reciente primero. */
export async function getRecentImportRuns(limit = 20): Promise<ImportRunRow[] | null> {
  const result = await withDb((db) =>
    db.importRun.findMany({
      orderBy: { startedAt: "desc" },
      take: limit,
    })
  );
  return result.ok ? result.data : null;
}

/** Una ejecución concreta del importador. */
export async function getImportRunById(id: number): Promise<ImportRunRow | null | undefined> {
  const result = await withDb((db) => db.importRun.findUnique({ where: { id } }));
  if (!result.ok) return null;
  return result.data ?? undefined;
}

export type ImportErrorRow = {
  id: number;
  importRunId: number;
  rowNumber: number | null;
  errorCode: string;
  message: string;
  rowData: unknown;
  createdAt: Date;
};

/** Errores de fila recientes, opcionalmente filtrados por ejecución. */
export async function getRecentImportErrors(params: { importRunId?: number; limit?: number } = {}): Promise<
  ImportErrorRow[] | null
> {
  const { importRunId, limit = 50 } = params;
  const result = await withDb((db) =>
    db.importError.findMany({
      where: importRunId ? { importRunId } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
    })
  );
  return result.ok ? result.data : null;
}
