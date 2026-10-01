import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProductDetail } from "@/server/dataSource/product";
import { formatPrice, bestOfferDiscount, formatProductDisplayName } from "@/lib/format";
import { buildBreadcrumbList, buildProductJsonLd, DEFAULT_OG_IMAGE_PATH } from "@/lib/seo";
import { serializeJsonLd } from "@/lib/jsonLd";
import { Container } from "@/components/ui/Container";
import { ProductGlyph } from "@/components/ui/ProductGlyph";
import { DiscountBadge } from "@/components/ui/DiscountBadge";
import { MerchantLogo } from "@/components/ui/MerchantLogo";
import { PriceHistoryChart } from "@/components/home/PriceHistoryChart";

export const dynamic = "force-dynamic";

/**
 * Orden de la tabla comparativa: primero las ofertas EN STOCK (nunca se
 * destaca como "Mejor precio" ni encabeza el "Desde X €" una oferta sin
 * stock, por barata que sea — sería mandar al usuario a un "Ver oferta"
 * que no puede completar); dentro de cada grupo, por PVP ascendente (solo
 * el precio del producto, nunca precio + envío — la web ya no muestra ni
 * calcula ningún total con gastos de envío). Una oferta sin stock sigue
 * apareciendo en la tabla (transparencia: el usuario ve que existe esa
 * tienda), solo nunca gana el primer puesto.
 */
function compareOffersForTable(a: { inStock: boolean; price: number }, b: typeof a): number {
  if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
  return a.price - b.price;
}

export async function generateMetadata({ params }: PageProps<"/producto/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const result = await getProductDetail(slug);
  if (result.status === "not-found") return {};

  const { product, source } = result;
  // Mismo criterio de "mejor oferta" que la tabla comparativa de la
  // página (ver compareOffersForTable): la tienda que se cita aquí como
  // "mejor precio" es la misma que encabeza esa tabla, y el precio es
  // siempre el PVP solo (nunca precio + envío).
  const best = [...product.offers].sort(compareOffersForTable)[0];
  const displayName = formatProductDisplayName(product.name, product.brand);
  const description = `Compara ${product.offers.length} ${product.offers.length === 1 ? "tienda" : "tiendas"} para ${displayName}. Desde ${formatPrice(best.price)}.`;
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
  // Tabla comparativa ordenada por disponibilidad y luego por precio
  // TOTAL (ver compareOffersForTable arriba) — no solo por precio de
  // producto: una tienda más barata en el producto pero con envío caro,
  // o sin stock, puede salir por detrás de otra con envío gratis y en
  // stock. Con una sola tienda activa, la tabla simplemente muestra esa
  // fila: no hay ningún caso especial de "una tienda" frente a "varias",
  // la misma estructura funciona igual con 1 o con N.
  const offers = [...product.offers].sort(compareOffersForTable);
  const best = offers[0];
  // El % y el precio tachado de la cabecera se calculan SOLO a partir de
  // la oferta destacada (`best`, la de menor precio total) — nunca del
  // mejor descuento de TODO el catálogo de ofertas, que podría venir de
  // una tienda distinta y mezclar el precio tachado de una oferta con el
  // % de otra (mismo criterio que ProductDealCard, ver ese fichero).
  const discount = bestOfferDiscount([best]);
  const percent = discount?.percent ?? 0;
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
          <div className="mt-1.5 flex flex-wrap items-baseline gap-2 sm:mt-2 sm:gap-3">
            <span className="text-sm font-medium text-navy-500 sm:text-base">Desde</span>
            <span className="text-lg font-bold text-navy-900 sm:text-2xl">{formatPrice(best.price)}</span>
            {discount && (
              <span className="text-xs text-navy-300 line-through sm:text-sm">{formatPrice(discount.previousPrice)}</span>
            )}
            <DiscountBadge percent={percent} />
          </div>
          <p className="mt-1 text-xs text-navy-500 sm:text-sm">
            Precio más bajo, en {merchants.find((m) => m.id === best.merchantId)?.name ?? "una tienda asociada"} ·
            Actualizado {best.lastCheckedLabel}
          </p>
        </div>
      </div>

      <section className="mt-5 sm:mt-8">
        <h2 className="font-serif text-lg font-semibold text-navy-900">
          Comparativa de {offers.length} {offers.length === 1 ? "tienda" : "tiendas"}
        </h2>
        {/*
          Tabla real (no una lista de tarjetas): pedida explícitamente
          como comparador estilo Idealo. `overflow-x-auto` para que en
          móvil se pueda desplazar en horizontal en vez de romper el
          layout — mismo patrón que el gráfico de historial de precio,
          justo debajo.
        */}
        <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-white">
          <table className="w-full min-w-[600px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-beige/50 text-left text-xs font-semibold uppercase tracking-wide text-navy-500">
                <th scope="col" className="px-3 py-2.5 sm:px-4">
                  Tienda
                </th>
                <th scope="col" className="px-3 py-2.5 sm:px-4">
                  Precio
                </th>
                <th scope="col" className="px-3 py-2.5 sm:px-4">
                  <span className="sr-only">Acción</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {offers.map((offer, index) => {
                const merchant = merchants.find((m) => m.id === offer.merchantId);
                const isBestPrice = index === 0;
                return (
                  <tr key={offer.id} className={`border-b border-border last:border-0 ${isBestPrice ? "bg-teal-600/5" : ""}`}>
                    <td className="px-3 py-3 sm:px-4">
                      <div className="flex items-center gap-2.5">
                        <MerchantLogo
                          merchant={{
                            name: merchant?.name ?? "Tienda asociada",
                            accentColor: merchant?.accentColor ?? "var(--color-navy-500)",
                            logoUrl: merchant?.logoUrl,
                          }}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-navy-900">{merchant?.name ?? "Tienda asociada"}</p>
                          <p className="text-xs text-navy-300">
                            {offer.inStock ? "En stock" : "Sin stock"} · Actualizado {offer.lastCheckedLabel}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-semibold text-navy-900 sm:px-4">
                      {formatPrice(offer.price)}
                      {isBestPrice && (
                        <span className="ml-2 rounded-full bg-teal-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          Mejor precio
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right sm:px-4">
                      <a
                        href={offer.url}
                        rel="nofollow sponsored noopener"
                        target="_blank"
                        className="inline-flex items-center justify-center rounded-full bg-navy-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-navy-700"
                      >
                        Ver oferta
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
