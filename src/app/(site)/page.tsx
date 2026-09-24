import type { Metadata } from "next";
import { BrandCarousel } from "@/components/home/BrandCarousel";
import { Hero } from "@/components/home/Hero";
import { CategoryRow } from "@/components/home/CategoryRow";
import { VerifiedDealsGrid } from "@/components/home/VerifiedDealsGrid";
import { ComparisonPanel } from "@/components/home/ComparisonPanel";
import { MarqueeBand } from "@/components/home/MarqueeBand";
import { Container } from "@/components/ui/Container";
import { getDealsGridBundle, getFeaturedBundle, getHomeCategories } from "@/server/dataSource/home";
import { SITE_URL } from "@/lib/seo";
import { serializeJsonLd } from "@/lib/jsonLd";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// /buscar existe de verdad (src/app/(site)/buscar/page.tsx acepta ?q=): la
// acción de búsqueda del JSON-LD solo se declara porque esa URL es real,
// nunca como una promesa de una funcionalidad que no existe.
const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Preciara",
  url: SITE_URL,
  potentialAction: {
    "@type": "SearchAction",
    target: `${SITE_URL}/buscar?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

/**
 * Sin esto, Next intentaría prerenderizar la portada como HTML estático en
 * el build (no detecta las consultas de Prisma como "dinámicas" igual que
 * detecta cookies()/headers()) y serviría esa foto fija para siempre hasta
 * el próximo despliegue. Con `force-dynamic`, cada visita vuelve a
 * resolver BD-o-demo en el momento, y el build nunca llega a ejecutar
 * estas consultas (la página dinámica no se renderiza durante `next build`).
 */
export const dynamic = "force-dynamic";

/**
 * Toda la portada dispara solo 3 llamadas a la capa de datos (categorías,
 * producto destacado, cuadrícula de bajadas), en paralelo, cada una ya
 * resuelta con BD-o-demo (ver src/server/dataSource). Los componentes
 * visuales no cambian: solo reciben por props lo que antes importaban
 * directamente de src/data/demo.
 */
export default async function Home() {
  const [categories, featured, dealsGrid] = await Promise.all([
    getHomeCategories(),
    getFeaturedBundle(),
    getDealsGridBundle(),
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteJsonLd) }} />

      {/*
        BrandCarousel y Hero son dos `<section>` navy de ancho completo,
        pegadas una a la otra sin ningún margen entre ellas — nunca dejan
        ver el fondo blanco de la página por encima ni entre ambas (ver
        Hero.tsx). El resto de la portada, a partir de aquí, vuelve al
        `Container` normal sobre fondo blanco.
      */}
      <BrandCarousel />
      <Hero />

      <Container className="pb-8 pt-6 sm:pt-7">
        <div id="categorias" className="scroll-mt-24">
          <CategoryRow categories={categories.data.categories} viewAllHref={categories.data.hasMore ? "/categorias" : undefined} />
        </div>

        <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_320px]">
          <VerifiedDealsGrid products={dealsGrid.data.products} merchants={dealsGrid.data.merchants} />
          <ComparisonPanel product={featured.data.product} merchants={featured.data.merchants} />
        </div>
      </Container>

      <MarqueeBand />
    </>
  );
}
