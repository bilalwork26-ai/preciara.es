import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { formatPrice, bestOfferDiscount, formatProductDisplayName } from "@/lib/format";
import { Container } from "@/components/ui/Container";
import { ProductGlyph } from "@/components/ui/ProductGlyph";
import { DiscountBadge } from "@/components/ui/DiscountBadge";
import { SearchForm } from "@/components/home/SearchForm";
import { searchHomeProducts } from "@/server/dataSource/search";

export const metadata: Metadata = {
  title: "Resultados de búsqueda",
};

export default async function BuscarPage({
  searchParams,
}: PageProps<"/buscar">) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const categoriaSlug = typeof params.categoria === "string" ? params.categoria : "";

  const { data, source } = await searchHomeProducts({ query, categorySlug: categoriaSlug });
  const categoria = data.categories.find((c) => c.slug === categoriaSlug);
  const results = data.products;

  return (
    <Container className="py-10" wide>
      <h1 className="font-serif text-2xl font-semibold text-navy-900 sm:text-3xl">
        {categoria ? categoria.name : "Buscar productos"}
      </h1>
      <p className="mt-1 text-sm text-navy-500">
        {query ? (
          <>
            Resultados para <span className="font-medium text-navy-700">&ldquo;{query}&rdquo;</span>
          </>
        ) : source === "demo" ? (
          "Datos de demostración: aún no está conectado el catálogo real."
        ) : (
          "Explora el catálogo completo."
        )}
      </p>

      <div className="mt-6 max-w-xl">
        <SearchForm id="search-buscar-page" />
      </div>

      {results.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <SearchX className="h-8 w-8 text-navy-300" aria-hidden="true" strokeWidth={1.5} />
          <p className="text-navy-500">
            {source === "demo"
              ? "No hemos encontrado productos de demostración con ese criterio."
              : "No hemos encontrado productos con ese criterio."}
          </p>
        </div>
      ) : (
        // Móvil: rejilla de 2 columnas con la tarjeta en vertical; ver el
        // comentario equivalente (con más detalle) en
        // categoria/[slug]/page.tsx — misma razón para `flex-wrap` en vez
        // de `grid` de columnas fijas a partir de `sm:`.
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:flex sm:flex-row sm:flex-wrap sm:gap-4">
          {results.map((product) => {
            const bestOffer = [...product.offers].sort((a, b) => a.price - b.price)[0];
            const merchant = data.merchants.find((m) => m.id === bestOffer?.merchantId);
            const displayName = formatProductDisplayName(product.name, product.brand);
            // El descuento puede estar en cualquier oferta, no solo en la de
            // precio más bajo — ver el mismo criterio, con más detalle, en
            // bestOfferDiscount (src/lib/format.ts) y ProductDealCard.
            const discount = bestOfferDiscount(product.offers);
            return (
              <li key={product.id} className="sm:min-w-[240px] sm:max-w-[560px] sm:flex-1">
                <Link
                  href={`/producto/${product.slug}`}
                  className="flex h-full flex-col items-center gap-2 rounded-2xl border border-border bg-white p-2.5 text-center shadow-sm transition-colors hover:border-teal-600 sm:flex-row sm:items-center sm:gap-3 sm:p-4 sm:text-left"
                >
                  <div className="relative shrink-0">
                    <ProductGlyph
                      icon={product.icon}
                      imageUrl={product.imageUrl}
                      alt={displayName}
                      className="h-16 w-16 sm:h-14 sm:w-14"
                    />
                    {discount && (
                      <div className="absolute left-0.5 top-0.5">
                        <DiscountBadge percent={discount.percent} size="sm" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 w-full">
                    <p className="line-clamp-2 text-xs font-medium text-navy-900 sm:truncate sm:text-sm">{displayName}</p>
                    {bestOffer && (
                      <>
                        <p className="mt-0.5 flex flex-wrap items-baseline justify-center gap-x-1.5 sm:justify-start">
                          <span className="text-sm font-semibold text-navy-900 sm:text-base">
                            {formatPrice(bestOffer.price)}
                          </span>
                          {discount && (
                            <del className="text-xs font-medium text-navy-400 line-through decoration-2">{formatPrice(discount.previousPrice)}</del>
                          )}
                        </p>
                        <p className="hidden text-xs text-navy-300 sm:block">Mejor precio en {merchant?.name}</p>
                      </>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Container>
  );
}
