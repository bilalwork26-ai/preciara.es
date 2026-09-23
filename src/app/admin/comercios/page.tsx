import { listMerchantsForAdmin } from "@/server/repositories/admin";
import { Badge } from "../_components/StatCard";

export const metadata = { title: "Comercios — Panel técnico", robots: { index: false, follow: false } };

const dateFormatter = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" });

export default async function AdminMerchantsPage() {
  const merchants = await listMerchantsForAdmin();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-serif text-2xl font-bold text-navy-900">Comercios</h1>
        <p className="mt-1 text-sm text-navy-500">{merchants ? `${merchants.length} comercios.` : "Base de datos no disponible."}</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-navy-300">
              <th className="px-4 py-3 font-semibold">Comercio</th>
              <th className="px-4 py-3 font-semibold">Web</th>
              <th className="px-4 py-3 font-semibold">Ofertas</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 font-semibold">Actualizado</th>
            </tr>
          </thead>
          <tbody>
            {(merchants ?? []).map((m) => (
              <tr key={m.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium text-navy-900">{m.name}</p>
                  <p className="text-xs text-navy-300">{m.slug}</p>
                </td>
                <td className="max-w-[240px] truncate px-4 py-3 text-navy-700">{m.websiteUrl ?? <span className="text-navy-300">Sin web</span>}</td>
                <td className="px-4 py-3 text-navy-700">{m.offerCount}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <Badge tone={m.isActive ? "ok" : "neutral"}>{m.isActive ? "Activo" : "Inactivo"}</Badge>
                    {m.isDemo && <Badge tone="warn">Demo</Badge>}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-navy-300">{dateFormatter.format(m.updatedAt)}</td>
              </tr>
            ))}
            {merchants?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-navy-300">
                  Sin comercios todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
