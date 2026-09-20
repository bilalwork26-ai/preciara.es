import Link from "next/link";
import { getRecentImportErrors } from "@/server/repositories/importRuns";

export const metadata = { title: "Errores — Panel técnico", robots: { index: false, follow: false } };

const dateFormatter = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" });

export default async function AdminErrorsPage() {
  const errors = await getRecentImportErrors({ limit: 200 });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-serif text-2xl font-bold text-navy-900">Errores de importación</h1>
        <p className="mt-1 text-sm text-navy-500">
          {errors ? `${errors.length} errores recientes.` : "Base de datos no disponible."}
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-navy-300">
              <th className="px-4 py-3 font-semibold">Importación</th>
              <th className="px-4 py-3 font-semibold">Fila</th>
              <th className="px-4 py-3 font-semibold">Código</th>
              <th className="px-4 py-3 font-semibold">Mensaje</th>
              <th className="px-4 py-3 font-semibold">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {(errors ?? []).map((e) => (
              <tr key={e.id} className="border-b border-border align-top last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/admin/importaciones/${e.importRunId}`} className="text-teal-600 hover:text-teal-700">
                    #{e.importRunId}
                  </Link>
                </td>
                <td className="px-4 py-3 text-navy-700">{e.rowNumber ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-xs text-navy-700">{e.errorCode}</td>
                <td className="px-4 py-3 text-navy-700">{e.message}</td>
                <td className="px-4 py-3 text-xs text-navy-300">{dateFormatter.format(e.createdAt)}</td>
              </tr>
            ))}
            {errors?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-navy-300">
                  Sin errores registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
