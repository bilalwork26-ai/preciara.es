import type { Metadata } from "next";
import { BrandCarousel } from "@/components/home/BrandCarousel";
import { Hero } from "@/components/home/Hero";
import { CategoryBanners } from "@/components/home/CategoryBanners";
import { HowItWorksSection } from "@/components/home/HowItWorksSection";
import { MarqueeBand } from "@/components/home/MarqueeBand";
import { Container } from "@/components/ui/Container";
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
 * La portada ya no dispara ninguna consulta a la capa de datos: el bloque
 * fijo de tarjetas de Supergangas se retiró (no tenía sentido mostrar 6-8
 * tarjetas fijas con un catálogo de miles de productos — ver
 * CategoryBanners.tsx, ahora el punto de entrada real al catálogo), y
 * `CategoryBanners` es navegación fija sin consulta propia (ver
 * categoryLinks.ts) — la fila de píldoras pequeñas (`CategoryRow`) se
 * retiró de la portada: duplicaba la misma navegación que el propio grid
 * fotográfico y le restaba impacto visual. Sin BD de por medio, la
 * portada vuelve a ser prerenderizable como HTML estático en el build —
 * ya no hace falta `force-dynamic`. "Supergangas" sigue existiendo como
 * página propia (`/supergangas`, ver getOfertasBundle en
 * src/server/dataSource/home.ts): solo se retiró su resumen fijo de la
 * portada.
 */
export default function Home() {
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
        <CategoryBanners />
      </Container>

      <HowItWorksSection />

      <MarqueeBand />
    </>
  );
}
