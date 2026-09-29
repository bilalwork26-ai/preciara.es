import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCategoryDetail } from "@/server/dataSource/category";
import { formatPrice, formatProductDisplayName } from "@/lib/format";
import { buildBreadcrumbList, DEFAULT_OG_IMAGE_PATH } from "@/lib/seo";
import { serializeJsonLd } from "@/lib/jsonLd";
import { Container } from "@/components/ui/Container";
import { ProductGlyph } from "@/components/ui/ProductGlyph";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/categoria/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const result = await getCategoryDetail(slug);
  if (result.status === "not-found") return {};

  const { category, products, source } = result;
  const description = `${products.length} productos con ofertas activas en ${category.name}. Compara precios entre tiendas españolas en Preciara.`;

  return {
    title: category.name,
    description,
    alternates: { canonical: `/categoria/${category.slug}` },
    robots: source === "demo" ? { index: false, follow: false } : undefined,
    openGraph: { title: category.name, description, type: "website", images: [DEFAULT_OG_IMAGE_PATH] },
    twitter: { card: "summary_large_image", title: category.name, description, images: [DEFAULT_OG_IMAGE_PATH] },
  };
}

export default async function CategoryPage({ params }: PageProps<"/categoria/[slug]">) {
  const { slug } = await params;
  const result = await getCategoryDetail(slug);
  if (result.status === "not-found") notFound();

  const { category, products, merchants, source } = result;

  const breadcrumbJsonLd = buildBreadcrumbList([
    { name: "Inicio", path: "/" },
    { name: category.name, path: `/categoria/${category.slug}` },
  ]);

  return (
    <Container className="py-10" wide>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />

      <h1 className="font-serif text-2xl font-bold text-navy-900 sm:text-3xl">{category.name}</h1>
      <p className="mt-1 text-sm text-navy-500">
        {source === "demo"
          ? "Datos de demostración: aún no está conectado el catálogo real para esta categoría."
          : `${products.length} productos con ofertas activas.`}
      </p>

      {/*
        Móvil: rejilla fija de 2 columnas (nunca 1 tarjeta a todo el ancho
        por fila) con la tarjeta en vertical (foto arriba, texto debajo) —
        una fila horizontal de icono+texto no cabe con holgura en la mitad
        del ancho de un móvil. Desde `sm:` en adelante, `flex-wrap` (no
        `grid` de columnas fijas): con un número de columnas fijo, una
        última fila incompleta deja columnas vacías visibles (no colapsan
        solas: siguen teniendo contenido en otras filas). Con flexbox,
        cada tarjeta crece para repartirse el hueco sobrante de su fila
        (`min-w`/`max-w` acotan cuánto), así que nunca queda un hueco
        grande a la derecha, y en monitores anchos caben más tarjetas por
        fila de forma natural.
      */}
      <ul className="mt-8 grid grid-cols-2 gap-3 sm:flex sm:flex-row sm:flex-wrap sm:gap-4">
        {products.map((product) => {
          const best = [...product.offers].sort((a, b) => a.price - b.price)[0];
          const merchant = merchants.find((m) => m.id === best?.merchantId);
          const displayName = formatProductDisplayName(product.name, product.brand);
          return (
            <li key={product.slug} className="sm:min-w-[240px] sm:max-w-[560px] sm:flex-1">
              <a
                href={`/producto/${product.slug}`}
                className="flex h-full flex-col items-center gap-2 rounded-2xl border border-border bg-white p-2.5 text-center shadow-sm transition-colors hover:border-teal-600 sm:flex-row sm:items-center sm:gap-3 sm:p-4 sm:text-left"
              >
                <ProductGlyph
                  icon={product.icon}
                  imageUrl={product.imageUrl}
                  alt={displayName}
                  className="h-16 w-16 shrink-0 sm:h-14 sm:w-14"
                />
                <div className="min-w-0 w-full">
                  <p className="line-clamp-2 text-xs font-medium text-navy-900 sm:truncate sm:text-sm">{displayName}</p>
                  {best && (
                    <>
                      <p className="mt-0.5 text-sm font-semibold text-navy-900 sm:text-base">{formatPrice(best.price)}</p>
                      <p className="hidden text-xs text-navy-300 sm:block">Mejor precio en {merchant?.name}</p>
                    </>
                  )}
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </Container>
  );
}
