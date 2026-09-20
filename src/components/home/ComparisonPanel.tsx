"use client";

import { useMemo, useState } from "react";
import { BarChart3, Bell } from "lucide-react";
import type { Merchant, Product } from "@/types";
import { formatPrice } from "@/lib/format";
import { PriceHistoryChart } from "./PriceHistoryChart";
import { isExternalHref } from "@/lib/url";

const PERIODS = [
  { id: "1m", label: "1M", months: 2 },
  { id: "3m", label: "3M", months: 3 },
  { id: "6m", label: "6M", months: 6 },
  { id: "1a", label: "1A", months: 12 },
] as const;

export function ComparisonPanel({ product, merchants }: { product: Product; merchants: Merchant[] }) {
  const [periodId, setPeriodId] = useState<(typeof PERIODS)[number]["id"]>("6m");
  const period = PERIODS.find((p) => p.id === periodId) ?? PERIODS[2];

  const history = product.priceHistory;
  const visibleHistory = useMemo(
    () => history.slice(Math.max(history.length - period.months, 0)),
    [history, period.months]
  );

  const minPrice = Math.min(...history.map((p) => p.price));
  const offers = [...product.offers].sort((a, b) => a.price - b.price);

  return (
    <div
      id="panel-comparacion"
      className="scroll-mt-24 flex h-full flex-col rounded-2xl border border-border bg-white p-5 shadow-sm"
    >
      <h2 className="font-serif text-xl font-bold leading-tight text-navy-900">
        Compara. Ahorra. Compra mejor.
      </h2>
      <p className="mt-1 text-sm text-navy-500">
        Descubre cómo evoluciona el precio de {product.name.toLowerCase()} y en qué tienda está más barato.
      </p>

      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-navy-300">Historial de precios</p>
        <div className="flex gap-1 rounded-full bg-beige p-1" role="group" aria-label="Periodo del historial">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriodId(p.id)}
              aria-pressed={p.id === periodId}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                p.id === periodId ? "bg-teal-600 text-white" : "text-navy-500 hover:text-navy-900"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mt-3">
        <PriceHistoryChart points={visibleHistory} />
        <div className="absolute right-0 top-0 rounded-lg bg-navy-900 px-2.5 py-1.5 text-right">
          <p className="text-[10px] font-medium uppercase tracking-wide text-navy-100">Precio mínimo</p>
          <p className="text-sm font-bold text-white">{formatPrice(minPrice)}</p>
        </div>
      </div>

      <div className="mt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-navy-300">Comparar tiendas</p>
        <ul className="mt-2 flex flex-col gap-2">
          {offers.map((offer, i) => {
            const merchant = merchants.find((m) => m.id === offer.merchantId);
            const external = isExternalHref(offer.url);
            return (
              <li
                key={offer.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
              >
                <span className="text-sm font-medium text-navy-700">{merchant?.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-navy-900">{formatPrice(offer.price)}</span>
                  {i === 0 ? (
                    <a
                      href={offer.url}
                      target={external ? "_blank" : undefined}
                      rel={external ? "nofollow sponsored noopener noreferrer" : undefined}
                      className="rounded-full bg-coral-500 px-3 py-1 text-xs font-semibold text-navy-900 transition-colors hover:bg-coral-600 hover:text-white"
                    >
                      Ver
                    </a>
                  ) : (
                    <a
                      href={offer.url}
                      target={external ? "_blank" : undefined}
                      rel={external ? "nofollow sponsored noopener noreferrer" : undefined}
                      className="rounded-full border border-border px-3 py-1 text-xs font-medium text-navy-700 transition-colors hover:border-teal-600 hover:text-teal-700"
                    >
                      Ver
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

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
          href="/metodologia"
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-navy-700 hover:border-teal-600 hover:text-teal-700"
        >
          <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
          Cómo verificamos
        </a>
      </div>
    </div>
  );
}
