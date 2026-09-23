import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProductDetail } from "@/server/dataSource/product";
import { formatPrice, calcDiscountPercent } from "@/lib/format";
import { buildBreadcrumbList, buildProductJsonLd } from "@/lib/seo";
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
  const description = `Compara ${product.offers.length} ${product.offers.length === 1 ? "tienda" : "tiendas"} para ${product.name}. Mejor precio: ${formatPrice(best.price)}.`;

  return {
    title: product.name,
    description,
    alternates: { canonical: `/producto/${product.slug}` },
    // Datos de demostración: nunca se indexan como si fueran catálogo real.
    robots: source === "demo" ? { index: false, follow: false } : undefined,
    openGraph: { title: product.name, description, type: "website" },
    twitter: { card: "summary", title: product.name, description },
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

  const breadcrumbJsonLd = buildBreadcrumbList([
    { name: "Inicio", path: "/" },
    { name: product.name, path: `/producto/${product.slug}` },
  ]);
  const productJsonLd = buildProductJsonLd(product, merchants, `/producto/${product.slug}`);

  return (
    <Container className="py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(productJsonLd) }} />

      {source === "demo" && (
        <p className="mb-4 rounded-lg bg-beige px-3 py-2 text-xs text-navy-500">
          Datos de demostración: aún no está conectado el catálogo real para este producto.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[auto_1fr] sm:items-start">
        <ProductGlyph icon={product.icon} className="h-32 w-32 rounded-2xl" iconClassName="h-14 w-14 text-navy-700" />
        <div>
          <h1 className="font-serif text-2xl font-bold text-navy-900 sm:text-3xl">{product.name}</h1>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-2xl font-bold text-navy-900">{formatPrice(best.price)}</span>
            {best.previousPrice && (
              <span className="text-sm text-navy-300 line-through">{formatPrice(best.previousPrice)}</span>
            )}
            <DiscountBadge percent={percent} />
          </div>
          <p className="mt-1 text-sm text-navy-500">
            Mejor precio en {merchants.find((m) => m.id === best.merchantId)?.name ?? "una tienda asociada"} ·
            Actualizado {best.lastCheckedLabel}
          </p>
        </div>
      </div>

      <section className="mt-8">
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
        <section className="mt-8">
          <h2 className="font-serif text-lg font-semibold text-navy-900">Historial de precio</h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-white p-4">
            <PriceHistoryChart points={product.priceHistory} />
          </div>
        </section>
      )}
    </Container>
  );
}
