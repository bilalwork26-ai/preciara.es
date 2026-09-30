"use client";

import { useState } from "react";
import Link from "next/link";
import { Flame, Heart } from "lucide-react";
import type { Merchant, Product } from "@/types";
import { formatPrice, bestOfferDiscount, formatProductDisplayName } from "@/lib/format";
import { ProductGlyph } from "@/components/ui/ProductGlyph";
import { DiscountBadge } from "@/components/ui/DiscountBadge";

export function ProductDealCard({
  product,
  merchants,
  highlight = false,
}: {
  product: Product;
  merchants: Merchant[];
  /** true para la tarjeta de mayor descuento de la cuadrícula (ver SupergangasGrid) — nunca se aplica sin descuento real. */
  highlight?: boolean;
}) {
  const [saved, setSaved] = useState(false);
  const offers = [...product.offers].sort((a, b) => a.price - b.price);
  const best = offers[0];
  // El descuento puede estar en cualquier oferta, no solo en la de precio
  // más bajo (ver bestOfferDiscount) — así la pastilla y el precio tachado
  // nunca se quedan sin mostrar una bajada real solo porque la tienda más
  // barata no trae su propio previousPrice registrado. Se muestran juntos
  // y a partir del MISMO dato (el previousPrice de esa oferta concreta),
  // nunca mezclando el precio tachado de una oferta con el % de otra.
  const discount = bestOfferDiscount(offers);
  const percent = discount?.percent ?? 0;
  const isHighlighted = highlight && percent > 0;
  // Solo para mostrar: la búsqueda de "Ver ofertas" más abajo sigue usando
  // product.name tal cual (sin formatear), para no romper la coincidencia
  // por texto contra el nombre real guardado en la BD.
  const displayName = formatProductDisplayName(product.name, product.brand);

  return (
    <div
      className={`flex h-full flex-col rounded-2xl border bg-white p-2 sm:p-4 ${
        isHighlighted ? "border-coral-500 shadow-md ring-2 ring-coral-500/30" : "border-border shadow-sm"
      }`}
    >
      {isHighlighted && (
        <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-coral-600 sm:mb-2 sm:text-[11px]">
          <Flame className="h-3 w-3 sm:h-3.5 sm:w-3.5" aria-hidden="true" strokeWidth={2} />
          Mayor bajada
        </p>
      )}
      <div className="relative">
        <Link href={`/producto/${product.slug}`} aria-label={`Ver detalle de ${displayName}`}>
          <ProductGlyph
            icon={product.icon}
            imageUrl={product.imageUrl}
            alt={displayName}
            className="h-16 w-full rounded-lg sm:h-32 sm:rounded-xl"
            iconClassName="h-7 w-7 text-navy-700 sm:h-12 sm:w-12"
          />
        </Link>
        <div className="absolute left-1 top-1 sm:left-2 sm:top-2">
          <DiscountBadge percent={percent} />
        </div>
        <button
          type="button"
          onClick={() => setSaved((v) => !v)}
          aria-pressed={saved}
          aria-label={saved ? `Quitar ${displayName} de guardados` : `Guardar ${displayName}`}
          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-navy-500 shadow-sm transition-colors hover:text-coral-600 sm:right-2 sm:top-2 sm:h-8 sm:w-8"
        >
          <Heart className={`h-3 w-3 sm:h-4 sm:w-4 ${saved ? "fill-coral-500 text-coral-500" : ""}`} aria-hidden="true" strokeWidth={1.75} />
        </button>
      </div>

      <Link
        href={`/producto/${product.slug}`}
        className="mt-1 block line-clamp-1 text-xs font-medium text-navy-900 hover:text-teal-700 sm:mt-3 sm:line-clamp-2 sm:text-sm"
      >
        {displayName}
      </Link>

      {/* `mt-auto` ancla este bloque (precio + info secundaria + botón) al
          fondo de la tarjeta: como las tarjetas de una misma fila se
          estiran a la misma altura (flex/grid con stretch por defecto) y
          el título puede ocupar 1 o 2 líneas según el producto, sin esto
          el precio y el botón "Ver ofertas" quedarían a distinta altura
          entre tarjetas vecinas. */}
      <div className="mt-auto flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 pt-1 sm:gap-x-2 sm:pt-1.5">
        <span className="text-sm font-bold text-navy-900 sm:text-lg">{formatPrice(best.price)}</span>
        {discount && (
          <del className="text-xs font-medium text-navy-400 line-through decoration-2 sm:text-sm">{formatPrice(discount.previousPrice)}</del>
        )}
      </div>
      {/* Información secundaria (tienda, resto de ofertas, frescura del
          dato) oculta en móvil a propósito: en una tarjeta de 2 columnas
          por fila no cabe sin obligar a una tarjeta mucho más alta que
          las demás — sigue visible desde `sm:` en adelante. */}
      <p className="hidden text-xs text-navy-300 sm:block">
        Mejor precio en {merchants.find((m) => m.id === best.merchantId)?.name}
      </p>

      {offers.length > 1 && (
        // Solo tiene sentido listar el resto de tiendas cuando hay más de
        // una oferta real: con una sola, repetiría la misma tienda y el
        // mismo precio que ya se muestra arriba (p. ej. "adidas ES 120,00
        // € / adidas ES 120,00 €"), que parece un error de duplicado.
        <ul className="mt-2 hidden flex-col gap-1 border-t border-border pt-2 sm:flex">
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

      <p className="mt-2 hidden text-[11px] text-navy-300 sm:block">Actualizado {best.lastCheckedLabel}</p>

      <a
        href={`/buscar?q=${encodeURIComponent(product.name)}`}
        className="mt-1.5 inline-flex items-center justify-center gap-1 rounded-full bg-teal-600 py-1.5 text-[11px] font-bold text-white shadow-sm transition-colors hover:bg-teal-700 sm:mt-3 sm:py-2 sm:text-xs"
      >
        Ver ofertas
        <span aria-hidden="true">→</span>
      </a>
    </div>
  );
}
