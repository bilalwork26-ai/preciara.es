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
        `flex-wrap` (no `grid` de columnas fijas): con un número de
        columnas fijo, una última fila incompleta deja columnas vacías
        visibles (no colapsan solas: siguen teniendo contenido en otras
        filas). Con flexbox, cada tarjeta crece para repartirse el hueco
        sobrante de su fila (`min-w`/`max-w` acotan cuánto), así que nunca
        queda un hueco grande a la derecha, y en monitores anchos caben
        más tarjetas por fila de forma natural.
      */}
      <ul className="mt-8 flex flex-col gap-4 sm:flex-row sm:flex-wrap">
        {products.map((product) => {
          const best = [...product.offers].sort((a, b) => a.price - b.price)[0];
          const merchant = merchants.find((m) => m.id === best?.merchantId);
          const displayName = formatProductDisplayName(product.name, product.brand);
          return (
            <li key={product.slug} className="sm:min-w-[240px] sm:max-w-[560px] sm:flex-1">
              <a
                href={`/producto/${product.slug}`}
                className="flex h-full items-center gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm transition-colors hover:border-teal-600"
              >
                <ProductGlyph
                  icon={product.icon}
                  imageUrl={product.imageUrl}
                  alt={displayName}
                  className="h-14 w-14 shrink-0"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-navy-900">{displayName}</p>
                  {best && (
                    <>
                      <p className="mt-0.5 text-base font-semibold text-navy-900">{formatPrice(best.price)}</p>
                      <p className="text-xs text-navy-300">Mejor precio en {merchant?.name}</p>
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
