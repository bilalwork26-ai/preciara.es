import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCategoryDetail } from "@/server/dataSource/category";
import { buildBreadcrumbList, DEFAULT_OG_IMAGE_PATH } from "@/lib/seo";
import { serializeJsonLd } from "@/lib/jsonLd";
import { Container } from "@/components/ui/Container";
import { CategoryProductGrid } from "@/components/category/CategoryProductGrid";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/categoria/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const result = await getCategoryDetail(slug);
  if (result.status === "not-found") return {};

  const { category, products, source } = result;
  // Sin "con ofertas activas": esta página muestra TODO el catálogo de la
  // categoría (con descuento o a precio normal, ver getCategoryDetail), así
  // que ese texto sugeriría un filtro de descuento que no existe aquí
  // (ese filtro es exclusivo de /supergangas, ver selectAllOfertas).
  const description = `${products.length} productos en ${category.name}. Compara precios entre tiendas españolas en Preciara.`;

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
          : `${products.length} ${products.length === 1 ? "producto" : "productos"} en ${category.name}, de todas las tiendas.`}
      </p>

      <CategoryProductGrid products={products} merchants={merchants} categorySlug={category.slug} />
    </Container>
  );
}
