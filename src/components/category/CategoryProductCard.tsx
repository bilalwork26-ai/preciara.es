import Link from "next/link";
import type { Merchant, Product } from "@/types";
import { formatPrice, bestOfferDiscount, formatProductDisplayName } from "@/lib/format";
import { ProductGlyph } from "@/components/ui/ProductGlyph";
import { DiscountBadge } from "@/components/ui/DiscountBadge";

/**
 * Tarjeta de listado horizontal (foto + nombre + precio), extraída de
 * `/categoria/[slug]` para poder reutilizarla también en el grid con
 * pestañas de subcategoría (`CategoryProductGrid.tsx`) sin duplicar el
 * marcado. Mismo tratamiento "el descuento es el protagonista" en toda la
 * web: el % en una pastilla coral/naranja bien visible, el precio
 * original tachado justo al lado del precio final, y el nombre de la
 * tienda real ("Mejor precio en adidas ES") — nunca solo el precio final
 * suelto, sin contexto de cuánto se ahorra ni dónde.
 */
export function CategoryProductCard({ product, merchants }: { product: Product; merchants: Merchant[] }) {
  const best = [...product.offers].sort((a, b) => a.price - b.price)[0];
  const merchant = merchants.find((m) => m.id === best?.merchantId);
  const displayName = formatProductDisplayName(product.name, product.brand);
  // El descuento puede estar en cualquier oferta, no solo en la de precio
  // más bajo — ver el mismo criterio, con más detalle, en
  // bestOfferDiscount (src/lib/format.ts) y ProductDealCard.
  const discount = bestOfferDiscount(product.offers);

  return (
    <Link
      href={`/producto/${product.slug}`}
      className="flex h-full flex-col items-center gap-2 rounded-2xl border border-border bg-white p-2.5 text-center shadow-sm transition-colors hover:border-teal-600 sm:flex-row sm:items-center sm:gap-3 sm:p-4 sm:text-left"
    >
      <div className="relative shrink-0">
        <ProductGlyph icon={product.icon} imageUrl={product.imageUrl} alt={displayName} className="h-16 w-16 sm:h-14 sm:w-14" />
        {discount && (
          <div className="absolute left-0.5 top-0.5">
            <DiscountBadge percent={discount.percent} size="sm" />
          </div>
        )}
      </div>
      <div className="min-w-0 w-full">
        <p className="line-clamp-2 text-xs font-medium text-navy-900 sm:truncate sm:text-sm">{displayName}</p>
        {best && (
          <>
            <p className="mt-0.5 flex flex-wrap items-baseline justify-center gap-x-1.5 sm:justify-start">
              <span className="text-sm font-semibold text-navy-900 sm:text-base">{formatPrice(best.price)}</span>
              {discount && (
                <del className="text-xs font-medium text-navy-400 line-through decoration-2">{formatPrice(discount.previousPrice)}</del>
              )}
            </p>
            <p className="hidden text-xs text-navy-300 sm:block">Mejor precio en {merchant?.name}</p>
          </>
        )}
      </div>
    </Link>
  );
}
