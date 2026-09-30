import type { Metadata } from "next";
import { Flame } from "lucide-react";
import { getOfertasBundle, SUPERGANGAS_MIN_DISCOUNT_PERCENT } from "@/server/dataSource/home";
import { buildBreadcrumbList, DEFAULT_OG_IMAGE_PATH } from "@/lib/seo";
import { serializeJsonLd } from "@/lib/jsonLd";
import { Container } from "@/components/ui/Container";
import { ProductDealCard } from "@/components/home/ProductDealCard";

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
  const { data, source } = await getOfertasBundle();

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
        Mismo criterio de layout que SupergangasGrid (portada): rejilla
        fija de 2 columnas en móvil, `flex-wrap` a partir de `sm:` para
        que la última fila incompleta nunca deje huecos vacíos. Con
        catálogo real pero 0 chollos (nunca con demo), no se pinta una
        rejilla vacía: el mensaje de arriba ya lo cuenta.
      */}
      {data.products.length > 0 && (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:flex sm:flex-row sm:flex-wrap sm:gap-4" aria-label={`Productos con descuento de al menos un ${SUPERGANGAS_MIN_DISCOUNT_PERCENT}%`}>
          {data.products.map((product, index) => (
            <div key={product.id} className="sm:min-w-[220px] sm:max-w-[380px] sm:flex-1">
              <ProductDealCard product={product} merchants={data.merchants} highlight={index === 0} />
            </div>
          ))}
        </div>
      )}
    </Container>
  );
}
