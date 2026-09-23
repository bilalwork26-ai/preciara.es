import Link from "next/link";
import { getSyncSourcesOverview, getSyncImportRunsPage } from "@/server/repositories/syncOverview";
import { Badge } from "../_components/StatCard";
import type { OfferSource } from "@/generated/prisma";

export const metadata = { title: "Sincronización — Panel técnico", robots: { index: false, follow: false } };

const dateFormatter = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" });

const SOURCE_LABEL: Record<OfferSource, string> = { CSV: "CSV", AWIN: "Awin", EBAY: "eBay" };

function StatusBadge({ status }: { status: string }) {
  if (status === "SUCCESS") return <Badge tone="ok">Correcta</Badge>;
  if (status === "PARTIAL") return <Badge tone="warn">Parcial</Badge>;
  if (status === "FAILED") return <Badge tone="bad">Fallida</Badge>;
  return <Badge tone="neutral">En curso</Badge>;
}

function durationLabel(startedAt: Date, finishedAt: Date | null): string {
  if (!finishedAt) return "—";
  const seconds = Math.max(0, Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000));
  if (seconds < 60) return `${seconds} s`;
  return `${Math.round(seconds / 60)} min`;
}

export default async function AdminSyncPage({ searchParams }: PageProps<"/admin/sincronizacion">) {
  const params = await searchParams;
  const rawPage = Array.isArray(params.page) ? params.page[0] : params.page;
  const page = Math.max(1, Number(rawPage) || 1);

  const [overview, runsPage] = await Promise.all([getSyncSourcesOverview(), getSyncImportRunsPage({ page })]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-navy-900">Sincronización de catálogo</h1>
        <p className="mt-1 text-sm text-navy-500">
          Estado de las fuentes automáticas (Awin, eBay). Panel de solo lectura: nunca inicia una sincronización
          desde aquí — el ejecutor real es <code className="text-xs">npm run catalog:sync:awin</code> por línea de
          comandos.
        </p>
      </div>

      {!overview ? (
        <p className="text-sm text-navy-500">Base de datos no disponible.</p>
      ) : (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {overview.map((source) => (
            <div key={source.source} className="rounded-xl border border-border bg-white p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-lg font-semibold text-navy-900">{SOURCE_LABEL[source.source]}</h2>
                {source.enabled ? <Badge tone="ok">Activada</Badge> : <Badge tone="neutral">Desactivada</Badge>}
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-navy-300">Última ejecución</dt>
                  <dd className="text-navy-700">
                    {source.lastImportRun ? dateFormatter.format(source.lastImportRun.startedAt) : "Todavía no se ha ejecutado"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-navy-300">Estado</dt>
                  <dd>
                    {source.lastImportRun ? (
                      <StatusBadge status={source.lastImportRun.status} />
                    ) : (
                      <Badge tone="neutral">Sin ejecuciones</Badge>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-navy-300">Próxima ejecución</dt>
                  <dd className="text-navy-700">{source.nextRunAt ? dateFormatter.format(source.nextRunAt) : "No programada"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-navy-300">Ejecuciones totales</dt>
                  <dd className="text-navy-700">
                    {source.totalRuns} <span className="text-navy-300">· {source.failedRunsRecent} fallidas de las últimas 20</span>
                  </dd>
                </div>
              </dl>

              {source.lastImportRun && (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs text-navy-500 sm:grid-cols-3">
                    <span>Filas leídas: {source.lastImportRun.rowsRead}</span>
                    <span>Rechazadas: {source.lastImportRun.rowsRejected}</span>
                    <span>
                      Duración: {durationLabel(source.lastImportRun.startedAt, source.lastImportRun.finishedAt)}
                    </span>
                    <span>
                      Productos: +{source.lastImportRun.productsCreated} / ~{source.lastImportRun.productsUpdated}
                    </span>
                    <span>
                      Ofertas: +{source.lastImportRun.offersCreated} / ~{source.lastImportRun.offersUpdated}
                    </span>
                  </div>
                  {source.lastImportRun.errorSummary && (
                    <p className="mt-2 rounded-lg bg-coral-50 px-3 py-2 text-xs text-coral-600">
                      {source.lastImportRun.errorSummary}
                    </p>
                  )}
                  <Link
                    href={`/admin/importaciones/${source.lastImportRun.id}`}
                    className="mt-2 inline-block text-xs font-medium text-teal-600 hover:text-teal-700"
                  >
                    Ver detalle de la última ejecución →
                  </Link>
                </>
              )}
            </div>
          ))}
        </section>
      )}

      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-navy-900">Historial (Awin + eBay)</h2>
          {runsPage && <p className="text-xs text-navy-300">{runsPage.totalRuns} ejecuciones en total.</p>}
        </div>

        <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-navy-300">
                <th className="px-4 py-3 font-semibold">#</th>
                <th className="px-4 py-3 font-semibold">Origen</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold">Filas</th>
                <th className="px-4 py-3 font-semibold">Rechazadas</th>
                <th className="px-4 py-3 font-semibold">Inicio</th>
              </tr>
            </thead>
            <tbody>
              {(runsPage?.runs ?? []).map((run) => (
                <tr key={run.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/admin/importaciones/${run.id}`} className="font-medium text-teal-600 hover:text-teal-700">
                      #{run.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-navy-700">{run.source}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={run.status} />
                  </td>
                  <td className="px-4 py-3 text-navy-700">{run.rowsRead}</td>
                  <td className="px-4 py-3 text-navy-700">{run.rowsRejected}</td>
                  <td className="px-4 py-3 text-xs text-navy-300">{dateFormatter.format(run.startedAt)}</td>
                </tr>
              ))}
              {runsPage?.runs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-navy-300">
                    Todavía no se ha ejecutado ninguna sincronización de Awin o eBay.
                  </td>
                </tr>
              )}
              {!runsPage && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-navy-300">
                    Base de datos no disponible.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {runsPage && runsPage.totalPages > 1 && (
          <nav className="mt-3 flex items-center justify-between text-sm" aria-label="Paginación del historial">
            <Link
              href={`/admin/sincronizacion?page=${Math.max(1, runsPage.page - 1)}`}
              aria-disabled={runsPage.page <= 1}
              className={`rounded-full border border-border px-3 py-1.5 ${runsPage.page <= 1 ? "pointer-events-none text-navy-300" : "text-navy-700 hover:border-teal-600 hover:text-teal-700"}`}
            >
              ← Anterior
            </Link>
            <span className="text-navy-300">
              Página {runsPage.page} de {runsPage.totalPages}
            </span>
            <Link
              href={`/admin/sincronizacion?page=${Math.min(runsPage.totalPages, runsPage.page + 1)}`}
              aria-disabled={runsPage.page >= runsPage.totalPages}
              className={`rounded-full border border-border px-3 py-1.5 ${runsPage.page >= runsPage.totalPages ? "pointer-events-none text-navy-300" : "text-navy-700 hover:border-teal-600 hover:text-teal-700"}`}
            >
              Siguiente →
            </Link>
          </nav>
        )}
      </section>
    </div>
  );
}
