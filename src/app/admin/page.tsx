import Link from "next/link";
import { getSystemStatus } from "@/server/repositories/systemStatus";
import { getRecentPriceChanges, getStaleOffers } from "@/server/repositories/offers";
import { getRecentImportRuns, getRecentImportErrors } from "@/server/repositories/importRuns";
import { getOfferStaleAfterHours } from "@/server/importer/staleOffers";
import { StatCard, Badge } from "./_components/StatCard";

export const metadata = { title: "Resumen — Panel técnico", robots: { index: false, follow: false } };

const dateFormatter = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" });
const priceFormatter = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

export default async function AdminDashboardPage() {
  const staleHours = getOfferStaleAfterHours();
  const [status, priceChanges, staleOffers, importRuns, importErrors] = await Promise.all([
    getSystemStatus(),
    getRecentPriceChanges(8),
    getStaleOffers(staleHours, 8),
    getRecentImportRuns(5),
    getRecentImportErrors({ limit: 8 }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-navy-900">Resumen del sistema</h1>
        <p className="mt-1 text-sm text-navy-500">
          Estado de la base de datos, catálogo y últimas ejecuciones del importador.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-navy-900">Base de datos:</span>
          {!status.databaseConfigured ? (
            <Badge tone="neutral">No configurada (DATABASE_URL ausente)</Badge>
          ) : !status.databaseReachable ? (
            <Badge tone="bad">Configurada pero no responde — revisa los logs del servidor</Badge>
          ) : (
            <Badge tone="ok">Conectada</Badge>
          )}
          <span className="mx-1 text-navy-300">·</span>
          <span className="text-sm font-semibold text-navy-900">Portada pública:</span>
          {status.usingFallback ? (
            <Badge tone="warn">Sirviendo datos de demostración (fallback)</Badge>
          ) : (
            <Badge tone="ok">Sirviendo datos de la base de datos</Badge>
          )}
        </div>
        <p className="mt-2 text-xs text-navy-300">
          La portada pública y el buscador ya leen de esta misma base de datos a través de
          <code className="mx-1">src/server/dataSource/*</code>
          y usan datos de demostración solo como respaldo automático (sin BD configurada, sin conexión, o catálogo
          insuficiente). Ver README (&ldquo;Cómo funciona el respaldo a datos de demostración&rdquo;).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Productos activos" value={status.activeProducts} />
        <StatCard label="Comercios activos" value={status.activeMerchants} />
        <StatCard label="Ofertas activas" value={status.activeOffers} hint={`${status.realOffers} reales · ${status.demoOffers} demo`} />
        <StatCard
          label="Última importación"
          value={status.lastImportAt ? dateFormatter.format(status.lastImportAt) : "—"}
        />
      </div>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-white p-4">
          <h2 className="font-serif text-lg font-semibold text-navy-900">Cambios de precio recientes</h2>
          {!priceChanges || priceChanges.length === 0 ? (
            <p className="mt-2 text-sm text-navy-500">Sin cambios registrados todavía.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {priceChanges.map((c) => (
                <li key={c.offerId} className="flex items-center justify-between gap-2 border-b border-border pb-2 last:border-0">
                  <span className="min-w-0 truncate text-navy-700">
                    {c.productName} <span className="text-navy-300">· {c.merchantName}</span>
                  </span>
                  <span className="shrink-0 text-navy-900">
                    {c.previousPrice != null && (
                      <span className="mr-1 text-navy-300 line-through">{priceFormatter.format(c.previousPrice)}</span>
                    )}
                    {priceFormatter.format(c.currentPrice)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-border bg-white p-4">
          <h2 className="font-serif text-lg font-semibold text-navy-900">
            Ofertas sin revisar (&gt;{staleHours} h)
          </h2>
          {!staleOffers || staleOffers.length === 0 ? (
            <p className="mt-2 text-sm text-navy-500">No hay ofertas antiguas pendientes de revisión.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {staleOffers.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 border-b border-border pb-2 last:border-0">
                  <span className="min-w-0 truncate text-navy-700">
                    {o.productName} <span className="text-navy-300">· {o.merchantName}</span>
                  </span>
                  <span className="shrink-0 text-xs text-navy-300">{dateFormatter.format(o.lastCheckedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg font-semibold text-navy-900">Últimas ejecuciones</h2>
            <Link href="/admin/importaciones" className="text-xs font-medium text-teal-600 hover:text-teal-700">
              Ver todas
            </Link>
          </div>
          {!importRuns || importRuns.length === 0 ? (
            <p className="mt-2 text-sm text-navy-500">Todavía no se ha ejecutado ninguna importación.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {importRuns.map((run) => (
                <li key={run.id} className="flex items-center justify-between gap-2 border-b border-border pb-2 last:border-0">
                  <Link href={`/admin/importaciones/${run.id}`} className="min-w-0 truncate text-navy-700 hover:text-teal-700">
                    #{run.id} · {run.source}
                  </Link>
                  <StatusBadge status={run.status} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-border bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg font-semibold text-navy-900">Errores recientes</h2>
            <Link href="/admin/errores" className="text-xs font-medium text-teal-600 hover:text-teal-700">
              Ver todos
            </Link>
          </div>
          {!importErrors || importErrors.length === 0 ? (
            <p className="mt-2 text-sm text-navy-500">Sin errores registrados.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {importErrors.map((e) => (
                <li key={e.id} className="border-b border-border pb-2 last:border-0">
                  <p className="truncate text-navy-700">
                    Ejecución #{e.importRunId}, fila {e.rowNumber ?? "—"}: {e.errorCode}
                  </p>
                  <p className="truncate text-xs text-navy-300">{e.message}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "SUCCESS") return <Badge tone="ok">Correcta</Badge>;
  if (status === "PARTIAL") return <Badge tone="warn">Parcial</Badge>;
  if (status === "FAILED") return <Badge tone="bad">Fallida</Badge>;
  return <Badge tone="neutral">En curso</Badge>;
}
