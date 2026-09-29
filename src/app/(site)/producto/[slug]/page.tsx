import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProductDetail } from "@/server/dataSource/product";
import { formatPrice, calcDiscountPercent, formatProductDisplayName } from "@/lib/format";
import { buildBreadcrumbList, buildProductJsonLd, DEFAULT_OG_IMAGE_PATH } from "@/lib/seo";
import { serializeJsonLd } from "@/lib/jsonLd";
import { Container } from "@/components/ui/Container";
import { ProductGlyph } from "@/components/ui/ProductGlyph";
import { DiscountBadge } from "@/components/ui/DiscountBadge";
import { PriceHistoryChart } from "@/components/home/PriceHistoryChart";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/producto/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const result = await getProductDetail(slug);
  if (result.status === "not-found") return {};

  const { product, source } = result;
  const best = [...product.offers].sort((a, b) => a.price - b.price)[0];
  const displayName = formatProductDisplayName(product.name, product.brand);
  const description = `Compara ${product.offers.length} ${product.offers.length === 1 ? "tienda" : "tiendas"} para ${displayName}. Mejor precio: ${formatPrice(best.price)}.`;
  // La foto real del producto (hotlinked del comercio/Awin/Amazon) si
  // existe, nunca una genérica que pretenda ser el producto — solo cuando
  // no hay ninguna se usa la tarjeta de marca por defecto.
  const ogImage = product.imageUrl || DEFAULT_OG_IMAGE_PATH;

  return {
    title: displayName,
    description,
    alternates: { canonical: `/producto/${product.slug}` },
    // Datos de demostración: nunca se indexan como si fueran catálogo real.
    robots: source === "demo" ? { index: false, follow: false } : undefined,
    openGraph: { title: displayName, description, type: "website", images: [{ url: ogImage, alt: displayName }] },
    twitter: { card: "summary_large_image", title: displayName, description, images: [ogImage] },
  };
}

export default async function ProductPage({ params }: PageProps<"/producto/[slug]">) {
  const { slug } = await params;
  const result = await getProductDetail(slug);
  if (result.status === "not-found") notFound();

  const { product, merchants, source } = result;
  const offers = [...product.offers].sort((a, b) => a.price - b.price);
  const best = offers[0];
  const percent = best.previousPrice ? calcDiscountPercent(best.price, best.previousPrice) : 0;
  const displayName = formatProductDisplayName(product.name, product.brand);

  const breadcrumbJsonLd = buildBreadcrumbList([
    { name: "Inicio", path: "/" },
    { name: displayName, path: `/producto/${product.slug}` },
  ]);
  // JSON-LD con el nombre ya formateado para mostrar (nunca el crudo del
  // feed con la marca pegada), sin tocar `product.name` en el resto del
  // objeto (offers/slug/etc. no cambian).
  const productJsonLd = buildProductJsonLd({ ...product, name: displayName }, merchants, `/producto/${product.slug}`);

  return (
    <Container className="py-5 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(productJsonLd) }} />

      {source === "demo" && (
        <p className="mb-4 rounded-lg bg-beige px-3 py-2 text-xs text-navy-500">
          Datos de demostración: aún no está conectado el catálogo real para este producto.
        </p>
      )}

      {/*
        En móvil, la foto y el título van en la misma fila desde el
        principio (nunca apilados) y ambos se reducen de tamaño: así la
        oferta y las tiendas quedan visibles mucho más arriba, sin
        obligar a bajar tanto para llegar a lo importante.
      */}
      <div className="grid grid-cols-[auto_1fr] items-start gap-3 sm:gap-6">
        <ProductGlyph
          icon={product.icon}
          imageUrl={product.imageUrl}
          alt={displayName}
          className="h-16 w-16 rounded-xl sm:h-32 sm:w-32 sm:rounded-2xl"
          iconClassName="h-7 w-7 text-navy-700 sm:h-14 sm:w-14"
        />
        <div>
          <h1 className="line-clamp-2 font-serif text-lg font-bold text-navy-900 sm:line-clamp-none sm:text-3xl">
            {displayName}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 sm:mt-2 sm:gap-3">
            <span className="text-lg font-bold text-navy-900 sm:text-2xl">{formatPrice(best.price)}</span>
            {best.previousPrice && (
              <span className="text-xs text-navy-300 line-through sm:text-sm">{formatPrice(best.previousPrice)}</span>
            )}
            <DiscountBadge percent={percent} />
          </div>
          <p className="mt-1 text-xs text-navy-500 sm:text-sm">
            Mejor precio en {merchants.find((m) => m.id === best.merchantId)?.name ?? "una tienda asociada"} ·
            Actualizado {best.lastCheckedLabel}
          </p>
        </div>
      </div>

      <section className="mt-5 sm:mt-8">
        <h2 className="font-serif text-lg font-semibold text-navy-900">
          Precios en {offers.length} {offers.length === 1 ? "tienda" : "tiendas"}
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          {offers.map((offer) => {
            const merchant = merchants.find((m) => m.id === offer.merchantId);
            return (
              <li
                key={offer.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-navy-900">{merchant?.name ?? "Tienda asociada"}</p>
                  <p className="text-xs text-navy-300">
                    {offer.inStock ? "En stock" : "Sin stock"} · Actualizado {offer.lastCheckedLabel}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-base font-semibold text-navy-900">{formatPrice(offer.price)}</span>
                  <a
                    href={offer.url}
                    rel="nofollow sponsored noopener"
                    target="_blank"
                    className="inline-flex items-center justify-center rounded-full bg-navy-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-navy-700"
                  >
                    Ver oferta
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {product.priceHistory.length >= 2 && (
        <section className="mt-5 sm:mt-8">
          <h2 className="font-serif text-lg font-semibold text-navy-900">Historial de precio</h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-white p-3 sm:p-4">
            <PriceHistoryChart points={product.priceHistory} />
          </div>
        </section>
      )}
    </Container>
  );
}
