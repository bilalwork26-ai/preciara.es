import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCategoryDetail } from "@/server/dataSource/category";
import { formatPrice } from "@/lib/format";
import { buildBreadcrumbList } from "@/lib/seo";
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
    openGraph: { title: category.name, description, type: "website" },
    twitter: { card: "summary", title: category.name, description },
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
    <Container className="py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />

      <h1 className="font-serif text-2xl font-bold text-navy-900 sm:text-3xl">{category.name}</h1>
      <p className="mt-1 text-sm text-navy-500">
        {source === "demo"
          ? "Datos de demostración: aún no está conectado el catálogo real para esta categoría."
          : `${products.length} productos con ofertas activas.`}
      </p>

      <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => {
          const best = [...product.offers].sort((a, b) => a.price - b.price)[0];
          const merchant = merchants.find((m) => m.id === best?.merchantId);
          return (
            <li key={product.slug}>
              <a
                href={`/producto/${product.slug}`}
                className="flex items-center gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm transition-colors hover:border-teal-600"
              >
                <ProductGlyph icon={product.icon} className="h-14 w-14 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-navy-900">{product.name}</p>
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
