import { notFound } from "next/navigation";
import { getImportRunById, getRecentImportErrors } from "@/server/repositories/importRuns";
import { Badge, StatCard } from "../../_components/StatCard";

export const metadata = { title: "Detalle de importación — Panel técnico", robots: { index: false, follow: false } };

const dateFormatter = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" });

function StatusBadge({ status }: { status: string }) {
  if (status === "SUCCESS") return <Badge tone="ok">Correcta</Badge>;
  if (status === "PARTIAL") return <Badge tone="warn">Parcial</Badge>;
  if (status === "FAILED") return <Badge tone="bad">Fallida</Badge>;
  return <Badge tone="neutral">En curso</Badge>;
}

export default async function AdminImportRunDetailPage({ params }: PageProps<"/admin/importaciones/[id]">) {
  const { id } = await params;
  const runId = Number(id);
  if (!Number.isInteger(runId)) notFound();

  const run = await getImportRunById(runId);
  if (run === undefined) notFound();
  if (run === null) {
    return <p className="text-sm text-navy-500">Base de datos no disponible.</p>;
  }

  const errors = await getRecentImportErrors({ importRunId: run.id, limit: 200 });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-serif text-2xl font-bold text-navy-900">Importación #{run.id}</h1>
        <StatusBadge status={run.status} />
      </div>
      <p className="text-sm text-navy-500">
        Origen: <span className="font-medium text-navy-700">{run.source}</span> · Inicio:{" "}
        {dateFormatter.format(run.startedAt)}
        {run.finishedAt && <> · Fin: {dateFormatter.format(run.finishedAt)}</>}
      </p>

      {run.errorSummary && (
        <p className="rounded-lg bg-coral-50 px-3 py-2 text-sm text-coral-600">{run.errorSummary}</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Filas leídas" value={run.rowsRead} />
        <StatCard label="Rechazadas" value={run.rowsRejected} />
        <StatCard label="Productos creados" value={run.productsCreated} />
        <StatCard label="Productos actualizados" value={run.productsUpdated} />
        <StatCard label="Ofertas creadas" value={run.offersCreated} />
        <StatCard label="Ofertas actualizadas" value={run.offersUpdated} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-navy-300">
              <th className="px-4 py-3 font-semibold">Fila</th>
              <th className="px-4 py-3 font-semibold">Código</th>
              <th className="px-4 py-3 font-semibold">Mensaje</th>
            </tr>
          </thead>
          <tbody>
            {(errors ?? []).map((e) => (
              <tr key={e.id} className="border-b border-border align-top last:border-0">
                <td className="px-4 py-3 text-navy-700">{e.rowNumber ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-xs text-navy-700">{e.errorCode}</td>
                <td className="px-4 py-3 text-navy-700">{e.message}</td>
              </tr>
            ))}
            {errors?.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-navy-300">
                  Sin filas rechazadas en esta ejecución.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
