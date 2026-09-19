import { LineChart } from "lucide-react";
import { demoFeaturedProduct } from "@/data/demo/products";
import { formatPrice, calcDiscountPercent } from "@/lib/format";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { PriceHistoryChart } from "./PriceHistoryChart";

export function PriceHistoryCard() {
  const history = demoFeaturedProduct.priceHistory;
  const prices = history.map((p) => p.price);
  const max = Math.max(...prices);
  const min = Math.min(...prices);
  const current = history[history.length - 1].price;
  const percent = calcDiscountPercent(current, max);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-white p-5 shadow-sm">
      <SectionHeading icon={LineChart} title="Historial de precios" />

      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-navy-500">{demoFeaturedProduct.name}</p>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-navy-900">{formatPrice(current)}</span>
            <span className="text-sm text-navy-300 line-through">{formatPrice(max)}</span>
            {percent > 0 && (
              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">
                −{percent}%
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex-1">
        <PriceHistoryChart points={history} />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4 text-center">
        <div>
          <dt className="text-xs text-navy-300">Precio máximo</dt>
          <dd className="mt-0.5 text-sm font-semibold text-navy-900">{formatPrice(max)}</dd>
        </div>
        <div>
          <dt className="text-xs text-navy-300">Precio mínimo</dt>
          <dd className="mt-0.5 text-sm font-semibold text-navy-900">{formatPrice(min)}</dd>
        </div>
        <div>
          <dt className="text-xs text-navy-300">Variación</dt>
          <dd className="mt-0.5 text-sm font-semibold text-coral-600">−{percent}%</dd>
        </div>
      </dl>
    </div>
  );
}
