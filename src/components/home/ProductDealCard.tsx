"use client";

import { useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import type { Merchant, Product } from "@/types";
import { formatPrice, calcDiscountPercent, formatProductDisplayName } from "@/lib/format";
import { ProductGlyph } from "@/components/ui/ProductGlyph";
import { DiscountBadge } from "@/components/ui/DiscountBadge";

export function ProductDealCard({ product, merchants }: { product: Product; merchants: Merchant[] }) {
  const [saved, setSaved] = useState(false);
  const offers = [...product.offers].sort((a, b) => a.price - b.price);
  const best = offers[0];
  const percent = best.previousPrice ? calcDiscountPercent(best.price, best.previousPrice) : 0;
  // Solo para mostrar: la búsqueda de "Comparar tiendas" más abajo sigue
  // usando product.name tal cual (sin formatear), para no romper la
  // coincidencia por texto contra el nombre real guardado en la BD.
  const displayName = formatProductDisplayName(product.name, product.brand);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div className="relative">
        <Link href={`/producto/${product.slug}`} aria-label={`Ver detalle de ${displayName}`}>
          <ProductGlyph
            icon={product.icon}
            imageUrl={product.imageUrl}
            alt={displayName}
            className="h-32 w-full rounded-xl"
            iconClassName="h-12 w-12 text-navy-700"
          />
        </Link>
        <div className="absolute left-2 top-2">
          <DiscountBadge percent={percent} />
        </div>
        <button
          type="button"
          onClick={() => setSaved((v) => !v)}
          aria-pressed={saved}
          aria-label={saved ? `Quitar ${displayName} de guardados` : `Guardar ${displayName}`}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-navy-500 shadow-sm transition-colors hover:text-coral-600"
        >
          <Heart className={`h-4 w-4 ${saved ? "fill-coral-500 text-coral-500" : ""}`} aria-hidden="true" strokeWidth={1.75} />
        </button>
      </div>

      <Link
        href={`/producto/${product.slug}`}
        className="mt-3 block line-clamp-2 text-sm font-medium text-navy-900 hover:text-teal-700"
      >
        {displayName}
      </Link>

      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-lg font-bold text-navy-900">{formatPrice(best.price)}</span>
        {best.previousPrice && (
          <del className="text-sm font-medium text-navy-400 line-through decoration-2">{formatPrice(best.previousPrice)}</del>
        )}
      </div>
      <p className="text-xs text-navy-300">
        Mejor precio en {merchants.find((m) => m.id === best.merchantId)?.name}
      </p>

      {offers.length > 1 && (
        // Solo tiene sentido listar el resto de tiendas cuando hay más de
        // una oferta real: con una sola, repetiría la misma tienda y el
        // mismo precio que ya se muestra arriba (p. ej. "adidas ES 120,00
        // € / adidas ES 120,00 €"), que parece un error de duplicado.
        <ul className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
          {offers.map((offer) => {
            const merchant = merchants.find((m) => m.id === offer.merchantId);
            return (
              <li key={offer.id} className="flex items-center justify-between text-xs text-navy-500">
                <span>{merchant?.name}</span>
                <span className="font-medium text-navy-700">{formatPrice(offer.price)}</span>
              </li>
            );
          })}
        </ul>
      )}

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
