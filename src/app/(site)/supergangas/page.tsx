import type { Metadata } from "next";
import { Flame } from "lucide-react";
import { getOfertasBundle, SUPERGANGAS_MIN_DISCOUNT_PERCENT } from "@/server/dataSource/home";
import { getCategoriesIndex } from "@/server/dataSource/category";
import { demoCategories } from "@/data/demo/categories";
import { buildBreadcrumbList, DEFAULT_OG_IMAGE_PATH } from "@/lib/seo";
import { serializeJsonLd } from "@/lib/jsonLd";
import { Container } from "@/components/ui/Container";
import { OfertasCatalog } from "@/components/supergangas/OfertasCatalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Supergangas",
  description: `Todos los chollos reales de Preciara: productos con un descuento confirmado de al menos un ${SUPERGANGAS_MIN_DISCOUNT_PERCENT}%.`,
  alternates: { canonical: "/supergangas" },
  openGraph: { title: "Supergangas — Preciara", type: "website", images: [DEFAULT_OG_IMAGE_PATH] },
  twitter: { card: "summary_large_image", title: "Supergangas — Preciara", images: [DEFAULT_OG_IMAGE_PATH] },
};

/**
 * Listado completo de "Supergangas" (enlazado desde el CTA del Hero y
 * desde la píldora "Supergangas" de la navegación principal, ver
 * categoryLinks.ts): a diferencia del adelanto de la portada
 * (`SupergangasGrid`, como mucho SUPERGANGAS_LIMIT tarjetas), aquí se
 * muestran TODOS los productos con descuento real
 * ≥SUPERGANGAS_MIN_DISCOUNT_PERCENT — ver `getOfertasBundle`.
 */
export default async function SupergangasPage() {
  const [{ data, source }, categoriesIndex] = await Promise.all([getOfertasBundle(), getCategoriesIndex()]);

  // `Product.categoryId` guarda el slug de la categoría con datos reales de
  // BD, pero el id interno del demo (p. ej. "cat-hogar") con datos de
  // demostración (quirk histórico del adaptador BD-o-demo, ver
  // transform.ts/category.ts) — se indexa por las dos claves a la vez para
  // que el desplegable muestre el nombre bonito sea cual sea la fuente
  // activa, sin tener que saber de antemano cuál es.
  //
  // `categoriesIndex` se queda corto en demo: solo trae categorías con al
  // menos un producto en el catálogo demo GENERAL (`demoProducts`), pero
  // `demoSupergangas` es una lista curada aparte que puede incluir una
  // categoría sin representación ahí (caso real: "Deporte") — sin este
  // añadido, esa opción del desplegable se quedaría con el id crudo
  // ("cat-deporte") en vez de su nombre. `demoCategories` (la lista
  // completa, sin filtrar) siempre cubre el hueco.
  const categoryNameById: Record<string, string> = {};
  for (const category of [...categoriesIndex.categories, ...demoCategories]) {
    categoryNameById[category.slug] = category.name;
    categoryNameById[category.id] = category.name;
  }

  const breadcrumbJsonLd = buildBreadcrumbList([
    { name: "Inicio", path: "/" },
    { name: "Supergangas", path: "/supergangas" },
  ]);

  return (
    <Container className="py-10" wide>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />

      <h1 className="flex items-center gap-2 font-serif text-2xl font-bold text-navy-900 sm:text-3xl">
        <Flame className="h-6 w-6 text-coral-500" aria-hidden="true" strokeWidth={1.75} />
        Supergangas
      </h1>
      <p className="mt-1 text-sm text-navy-500">
        {source === "demo"
          ? "Datos de demostración: aún no está conectado el catálogo real."
          : data.products.length > 0
            ? `${data.products.length} ${data.products.length === 1 ? "producto" : "productos"} con un descuento real de al menos un ${SUPERGANGAS_MIN_DISCOUNT_PERCENT}%.`
            : `Ahora mismo no hay ningún producto de nuestro catálogo real con un descuento de al menos un ${SUPERGANGAS_MIN_DISCOUNT_PERCENT}%. Vuelve pronto.`}
      </p>

      {/*
        Filtros por categoría/tienda + rejilla paginada en cliente (ver
        OfertasCatalog.tsx) — con catálogo real pero 0 chollos (nunca con
        demo), no se pinta nada más: el mensaje de arriba ya lo cuenta.
      */}
      {data.products.length > 0 && <OfertasCatalog products={data.products} merchants={data.merchants} categoryNameById={categoryNameById} />}
    </Container>
  );
}
