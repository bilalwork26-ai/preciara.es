import type { Metadata } from "next";
import { BrandCarousel } from "@/components/home/BrandCarousel";
import { Hero } from "@/components/home/Hero";
import { CategoryRow } from "@/components/home/CategoryRow";
import { CategoryBanners } from "@/components/home/CategoryBanners";
import { SupergangasGrid } from "@/components/home/SupergangasGrid";
import { HowItWorksSection } from "@/components/home/HowItWorksSection";
import { MarqueeBand } from "@/components/home/MarqueeBand";
import { Container } from "@/components/ui/Container";
import { getSupergangasBundle } from "@/server/dataSource/home";
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
 * La portada dispara una sola llamada a la capa de datos (Supergangas),
 * ya resuelta con BD-o-demo (ver src/server/dataSource) — la fila de
 * categorías (`CategoryRow`) es ahora una navegación fija, sin consulta
 * propia (ver categoryLinks.ts).
 */
export default async function Home() {
  const supergangas = await getSupergangasBundle();

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
          <CategoryRow />
        </div>

        <div className="mt-6">
          <CategoryBanners />
        </div>

        {/*
          El panel de comparación lateral ("Compara. Ahorra. Compra
          mejor.") se retiró: mostraba siempre un producto/historial de
          demostración fijo (slug curado sin datos reales detrás en el
          catálogo actual, solo-Adidas), nunca datos verdaderos del
          visitante — así que "Supergangas" pasa a ocupar todo el ancho
          disponible en vez de compartirlo con una columna fija de 320px
          sin contenido real.
        */}
        <div className="mt-8">
          <SupergangasGrid products={supergangas.data.products} merchants={supergangas.data.merchants} source={supergangas.source} />
        </div>
      </Container>

      <HowItWorksSection />

      <MarqueeBand />
    </>
  );
}
