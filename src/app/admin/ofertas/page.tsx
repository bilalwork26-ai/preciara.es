import { listOffersForAdmin } from "@/server/repositories/admin";
import { Badge } from "../_components/StatCard";

export const metadata = { title: "Ofertas — Panel técnico", robots: { index: false, follow: false } };

const dateFormatter = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" });
const priceFormatter = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

const AVAILABILITY_LABEL: Record<string, string> = {
  IN_STOCK: "En stock",
  OUT_OF_STOCK: "Agotado",
  PREORDER: "Reserva",
  DISCONTINUED: "Descatalogado",
  UNKNOWN: "Desconocido",
};

export default async function AdminOffersPage() {
  const offers = await listOffersForAdmin();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-serif text-2xl font-bold text-navy-900">Ofertas</h1>
        <p className="mt-1 text-sm text-navy-500">{offers ? `${offers.length} ofertas.` : "Base de datos no disponible."}</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-navy-300">
              <th className="px-4 py-3 font-semibold">Producto</th>
              <th className="px-4 py-3 font-semibold">Comercio</th>
              <th className="px-4 py-3 font-semibold">Precio</th>
              <th className="px-4 py-3 font-semibold">Disponibilidad</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 font-semibold">Última revisión</th>
            </tr>
          </thead>
          <tbody>
            {(offers ?? []).map((o) => (
              <tr key={o.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-navy-900">{o.productName}</td>
                <td className="px-4 py-3 text-navy-700">{o.merchantName}</td>
                <td className="px-4 py-3 text-navy-900">
                  {o.previousPrice != null && (
                    <span className="mr-1 text-navy-300 line-through">{priceFormatter.format(o.previousPrice)}</span>
                  )}
                  {priceFormatter.format(o.currentPrice)}
                </td>
                <td className="px-4 py-3 text-navy-700">{AVAILABILITY_LABEL[o.availability] ?? o.availability}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <Badge tone={o.isActive ? "ok" : "neutral"}>{o.isActive ? "Activa" : "Inactiva"}</Badge>
                    {o.isDemo && <Badge tone="warn">Demo</Badge>}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-navy-300">{dateFormatter.format(o.lastCheckedAt)}</td>
              </tr>
            ))}
            {offers?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-navy-300">
                  Sin ofertas todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
