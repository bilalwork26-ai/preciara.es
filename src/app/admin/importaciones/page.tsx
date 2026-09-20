import Link from "next/link";
import { getRecentImportRuns } from "@/server/repositories/importRuns";
import { Badge } from "../_components/StatCard";

export const metadata = { title: "Importaciones — Panel técnico", robots: { index: false, follow: false } };

const dateFormatter = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" });

function StatusBadge({ status }: { status: string }) {
  if (status === "SUCCESS") return <Badge tone="ok">Correcta</Badge>;
  if (status === "PARTIAL") return <Badge tone="warn">Parcial</Badge>;
  if (status === "FAILED") return <Badge tone="bad">Fallida</Badge>;
  return <Badge tone="neutral">En curso</Badge>;
}

export default async function AdminImportRunsPage() {
  const runs = await getRecentImportRuns(100);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-serif text-2xl font-bold text-navy-900">Historial de importaciones</h1>
        <p className="mt-1 text-sm text-navy-500">{runs ? `${runs.length} ejecuciones.` : "Base de datos no disponible."}</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-white">
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
            {(runs ?? []).map((run) => (
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
            {runs?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-navy-300">
                  Todavía no se ha ejecutado ninguna importación.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
