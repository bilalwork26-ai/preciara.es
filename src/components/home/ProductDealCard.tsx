"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import type { Product } from "@/types";
import { demoMerchants } from "@/data/demo/merchants";
import { formatPrice, calcDiscountPercent } from "@/lib/format";
import { ProductGlyph } from "@/components/ui/ProductGlyph";
import { DiscountBadge } from "@/components/ui/DiscountBadge";

export function ProductDealCard({ product }: { product: Product }) {
  const [saved, setSaved] = useState(false);
  const offers = [...product.offers].sort((a, b) => a.price - b.price);
  const best = offers[0];
  const percent = best.previousPrice ? calcDiscountPercent(best.price, best.previousPrice) : 0;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-white p-3 shadow-sm">
      <div className="relative">
        <ProductGlyph
          icon={product.icon}
          className="h-28 w-full rounded-xl"
          iconClassName="h-11 w-11 text-navy-700"
        />
        <div className="absolute left-2 top-2">
          <DiscountBadge percent={percent} />
        </div>
        <button
          type="button"
          onClick={() => setSaved((v) => !v)}
          aria-pressed={saved}
          aria-label={saved ? `Quitar ${product.name} de guardados` : `Guardar ${product.name}`}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-navy-500 shadow-sm transition-colors hover:text-coral-600"
        >
          <Heart className={`h-4 w-4 ${saved ? "fill-coral-500 text-coral-500" : ""}`} aria-hidden="true" strokeWidth={1.75} />
        </button>
      </div>

      <p className="mt-3 line-clamp-2 text-sm font-medium text-navy-900">{product.name}</p>

      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-lg font-bold text-navy-900">{formatPrice(best.price)}</span>
        {best.previousPrice && (
          <span className="text-xs text-navy-300 line-through">{formatPrice(best.previousPrice)}</span>
        )}
      </div>
      <p className="text-xs text-navy-300">
        Mejor precio en {demoMerchants.find((m) => m.id === best.merchantId)?.name}
      </p>

      <ul className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
        {offers.map((offer) => {
          const merchant = demoMerchants.find((m) => m.id === offer.merchantId);
          return (
            <li key={offer.id} className="flex items-center justify-between text-xs text-navy-500">
              <span>{merchant?.name}</span>
              <span className="font-medium text-navy-700">{formatPrice(offer.price)}</span>
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-[11px] text-navy-300">Actualizado {best.lastCheckedLabel}</p>

      <a
        href={`/buscar?q=${encodeURIComponent(product.name)}`}
        className="mt-3 inline-flex items-center justify-center rounded-full border border-border py-2 text-xs font-semibold text-navy-700 transition-colors hover:border-teal-600 hover:text-teal-700"
      >
        Comparar tiendas
      </a>
    </div>
  );
}
