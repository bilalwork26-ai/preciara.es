import Link from "next/link";
import { getSyncSourcesOverview, getSyncImportRunsPage } from "@/server/repositories/syncOverview";
import { getRecentAwinSyncCycleRuns } from "@/server/repositories/awinSyncCycles";
import { Badge } from "../_components/StatCard";
import type { OfferSource } from "@/generated/prisma";

const SKIPPED_REASON_LABEL: Record<"NOT_JOINED" | "NON_SPANISH_LANGUAGE", string> = {
  NOT_JOINED: "Sin contrato (Not Joined)",
  NON_SPANISH_LANGUAGE: "Idioma no español",
};

export const metadata = { title: "Sincronización — Panel técnico", robots: { index: false, follow: false } };

const dateFormatter = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" });

const SOURCE_LABEL: Record<OfferSource, string> = { CSV: "CSV", AWIN: "Awin", EBAY: "eBay", AMAZON: "Amazon" };

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

  const [overview, runsPage, awinCycleRuns] = await Promise.all([
    getSyncSourcesOverview(),
    getSyncImportRunsPage({ page }),
    getRecentAwinSyncCycleRuns(5),
  ]);

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
        <div>
          <h2 className="font-serif text-lg font-semibold text-navy-900">Diagnóstico de ciclos Awin</h2>
          <p className="mt-1 text-sm text-navy-500">
            Por qué un anunciante no aparece: omitido antes de procesar (sin contrato o idioma no español) o
            procesado pero sin productos válidos en su feed.
          </p>
        </div>

        {!awinCycleRuns ? (
          <p className="mt-3 text-sm text-navy-500">Base de datos no disponible.</p>
        ) : awinCycleRuns.length === 0 ? (
          <p className="mt-3 text-sm text-navy-500">
            Todavía no hay ciclos de Awin registrados con este diagnóstico detallado.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            {awinCycleRuns.map((run) => {
              const emptyAdvertisers = run.advertiserOutcomes.filter(
                (advertiser) => advertiser.validRowsTotal === 0 || advertiser.feedsEmpty > 0
              );
              return (
                <div key={run.id} className="rounded-xl border border-border bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-navy-900">{dateFormatter.format(run.startedAt)}</span>
                      {run.dryRun && <Badge tone="neutral">Simulación (dry-run)</Badge>}
                      {run.listFatalError && <Badge tone="bad">Error al listar feeds</Badge>}
                    </div>
                    <span className="text-xs text-navy-300">
                      {run.feedsDiscovered} feeds descubiertos · {run.feedsApproved} aprobados ·{" "}
                      {run.feedsSkippedNotJoined} sin contrato · {run.feedsSkippedNonSpanishLanguage} idioma no
                      español
                    </span>
                  </div>

                  {run.skippedFeeds.length > 0 && (
                    <div className="mt-3 border-t border-border pt-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-navy-300">
                        Anunciantes omitidos antes de procesar ({run.skippedFeeds.length})
                      </h3>
                      <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                        {run.skippedFeeds.map((feed, index) => (
                          <li key={`${feed.advertiserId}-${feed.feedId}-${index}`} className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-navy-700">{feed.advertiserName}</span>
                            <span className="text-xs text-navy-300">({feed.feedName})</span>
                            <Badge tone={feed.reason === "NOT_JOINED" ? "bad" : "warn"}>
                              {SKIPPED_REASON_LABEL[feed.reason]}
                            </Badge>
                            <span className="text-xs text-navy-300">{feed.detail}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {emptyAdvertisers.length > 0 && (
                    <div className="mt-3 border-t border-border pt-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-navy-300">
                        Anunciantes procesados sin productos válidos ({emptyAdvertisers.length})
                      </h3>
                      <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                        {emptyAdvertisers.map((advertiser) => (
                          <li key={advertiser.advertiserId} className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-navy-700">{advertiser.merchantSlug}</span>
                            <Badge tone="warn">0 productos válidos</Badge>
                            <span className="text-xs text-navy-300">
                              {advertiser.feedCount} feed(s) · {advertiser.feedsEmpty} vacío(s) · {advertiser.invalidRowsTotal} filas inválidas
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {run.skippedFeeds.length === 0 && emptyAdvertisers.length === 0 && (
                    <p className="mt-3 border-t border-border pt-3 text-xs text-navy-300">
                      Ningún anunciante omitido ni sin productos en este ciclo.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

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
