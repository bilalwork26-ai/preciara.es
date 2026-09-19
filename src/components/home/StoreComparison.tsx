import { Scale, Bell, BarChart3 } from "lucide-react";
import { demoFeaturedProduct } from "@/data/demo/products";
import { demoMerchants } from "@/data/demo/merchants";
import { formatPrice } from "@/lib/format";
import { SectionHeading } from "@/components/ui/SectionHeading";

export function StoreComparison() {
  const offers = [...demoFeaturedProduct.offers].sort((a, b) => a.price - b.price);
  const bestPrice = offers[0]?.price;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-white p-5 shadow-sm">
      <SectionHeading icon={Scale} title="Comparar tiendas" />
      <p className="mt-1 text-sm text-navy-500">
        {demoFeaturedProduct.name} · Mismo producto, diferentes precios
      </p>

      <ul className="mt-4 flex flex-1 flex-col gap-2">
        {offers.map((offer) => {
          const merchant = demoMerchants.find((m) => m.id === offer.merchantId);
          const isBest = offer.price === bestPrice;
          return (
            <li
              key={offer.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5"
            >
              <span className="text-sm font-medium text-navy-700">{merchant?.name}</span>
              <span className="text-sm font-semibold text-navy-900">{formatPrice(offer.price)}</span>
              {isBest ? (
                <a
                  href={offer.url}
                  className="rounded-full bg-teal-600 px-3.5 py-1.5 text-xs font-semibold text-ivory transition-colors hover:bg-teal-700"
                >
                  Ver mejor precio
                </a>
              ) : (
                <a
                  href={offer.url}
                  className="rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-teal-600 hover:text-teal-700"
                >
                  Ir a la tienda
                </a>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4">
        <button
          type="button"
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-navy-500"
          disabled
          aria-disabled="true"
          title="Las alertas de precio llegarán en una fase posterior"
        >
          <Bell className="h-3.5 w-3.5" aria-hidden="true" />
          Crear alerta
        </button>
        <a
          href="#historial-de-precios"
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-navy-700 hover:border-teal-600 hover:text-teal-700"
        >
          <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
          Ver historial
        </a>
      </div>
    </div>
  );
}
