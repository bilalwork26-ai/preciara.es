import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * El proyecto no tiene infraestructura de test de componentes (sin
 * `@testing-library/react`, sin `jsdom`) y no se añade aquí por la misma
 * razón documentada en `src/server/repositories/categories.test.ts` (no
 * instalar una dependencia nueva sin que se pida explícitamente). En su
 * lugar, esta prueba verifica de forma estática y determinista los
 * requisitos de negocio del hero — texto exacto, un único enlace real a
 * `/buscar`, ninguna animación/JS visual, una única fotografía real —
 * leyendo el código fuente en vez de renderizarlo. La revisión visual real
 * (composición, recorte de la foto en cada ancho) queda verificada por
 * capturas reales — ver el informe de la tarea.
 */
const heroSource = readFileSync(path.resolve(import.meta.dirname, "Hero.tsx"), "utf8");
const pageSource = readFileSync(
  path.resolve(import.meta.dirname, "../../app/(site)/page.tsx"),
  "utf8"
);
const globalsCssSource = readFileSync(
  path.resolve(import.meta.dirname, "../../app/globals.css"),
  "utf8"
);

describe("Hero.tsx: hero estático único (sustituye a PromoBannerMain + PromoBannerSecondary)", () => {
  it("es un componente de servidor: nunca 'use client', nunca un manejador de evento de ratón/puntero/táctil", () => {
    expect(heroSource).not.toContain('"use client"');
    expect(heroSource).not.toMatch(/on(Mouse|Pointer|Touch)\w+\s*=/);
    expect(heroSource).not.toMatch(/addEventListener/);
  });

  it("no usa requestAnimationFrame, transform ni ninguna transición/animación CSS", () => {
    expect(heroSource).not.toMatch(/requestAnimationFrame/);
    expect(heroSource).not.toMatch(/\btransform\b/);
    expect(heroSource).not.toMatch(/\btransition(?!-colors)/); // solo se permite transition-colors (hover del CTA)
    expect(heroSource).not.toMatch(/\banimate|\bmotion\b|parallax/i);
  });

  it("contiene el copy real exigido, exacto (texto HTML, no una imagen con el texto incrustado)", () => {
    expect(heroSource).toContain("Los mejores productos. Las mejores ofertas.");
    expect(heroSource).toContain("Moda, hogar, tecnología, belleza y mucho más, comparado para ti.");
    expect(heroSource).toContain("Descubrir ofertas");
    expect(heroSource).toContain("Precios claros · Varias tiendas");
  });

  it("ya no muestra la etiqueta 'Compara y ahorra' (retirada a propósito) ni la píldora teal que la contenía", () => {
    expect(heroSource).not.toContain("Compara y ahorra");
    expect(heroSource).not.toContain("bg-teal-600");
  });

  it("hay un único <h1>, y es exactamente el titular exigido", () => {
    const h1Matches = [...heroSource.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)];
    expect(h1Matches.length).toBe(1);
    expect(h1Matches[0][1].trim()).toBe("Los mejores productos. Las mejores ofertas.");
  });

  it("el CTA es un enlace real (<a href>) a /buscar, con estado hover y sin depender de JS para funcionar", () => {
    const ctaMatch = heroSource.match(/<a\s+href="([^"]+)"[^>]*>/);
    expect(ctaMatch?.[1]).toBe("/buscar");
    expect(heroSource).toMatch(/hover:bg-coral-600/);
  });

  it("nunca muestra precio, descuento ni historial de un único producto (el catálogo tiene muchos productos, sería engañoso)", () => {
    for (const forbidden of ["formatPrice", "calcDiscountPercent", "MiniSparkline", "PriceHistoryChart", "previousPrice", "priceHistory", "product.offers"]) {
      expect(heroSource).not.toContain(forbidden);
    }
    expect(heroSource).not.toMatch(/\bproduct\b/i); // nunca recibe un producto concreto por props
  });

  it("usa el mismo archivo de fotografía real (next/image) en las dos disposiciones responsive (fondo de escritorio + bloque de móvil), nunca productos/capas separados ni una segunda composición distinta", () => {
    expect(heroSource).toContain('import Image from "next/image"');
    const imageTagCount = (heroSource.match(/<Image\s/g) ?? []).length;
    expect(imageTagCount).toBe(2); // una para el fondo de escritorio, otra para el bloque de móvil — nunca capas de producto sueltas
    const srcCount = (heroSource.match(/\/images\/home\/hero-lifestyle-collection-v1\.webp/g) ?? []).length;
    expect(srcCount).toBe(2); // el mismo archivo en las dos, nunca un recorte pre-generado distinto
  });

  it("la fotografía de escritorio usa object-cover recortado a la derecha", () => {
    expect(heroSource).toMatch(/object-cover/);
    expect(heroSource).toMatch(/object-right/);
  });

  it("la imagen tiene un alt real y descriptivo (no alt=\"\" genérico, no falta el atributo)", () => {
    const altMatch = heroSource.match(/alt="([^"]*)"/);
    expect(altMatch?.[1]).toBeTruthy();
    expect(altMatch!.length).toBeGreaterThan(0);
    expect(altMatch?.[1].length).toBeGreaterThan(10);
  });

  it("declara sizes (para que next/image sirva el tamaño adecuado por dispositivo) y priority (LCP de la portada)", () => {
    expect(heroSource).toMatch(/sizes=/);
    expect(heroSource).toMatch(/\bpriority\b/);
  });

  it("sección navy de ancho completo (nunca una tarjeta): la raíz no lleva rounded-* ni ningún borde propio (overflow-hidden sí es necesario aquí, para contener las capas absolutas de fondo — mismo patrón que BrandCarousel; el rounded-full del CTA es un botón, no la tarjeta)", () => {
    const rootMatch = heroSource.match(/return\s*\(\s*<section className="([^"]*)"/);
    expect(rootMatch?.[1]).toContain("bg-navy-900");
    expect(rootMatch?.[1]).not.toMatch(/rounded/);
    expect(rootMatch?.[1]).not.toMatch(/\bborder(?!-\S)/); // "border" solo aparece aquí si es un borde real (nunca como sub-cadena de otra clase)
  });

  it("usa <section>, no <div>, como elemento raíz (semántica de sección de página, no de tarjeta aislada)", () => {
    const rootTagMatch = heroSource.match(/return\s*\(\s*<(\w+)/);
    expect(rootTagMatch?.[1]).toBe("section");
  });

  it("usa el mismo Container que el resto de la web para alinear el contenido (nunca un ancho/margen propio inventado)", () => {
    expect(heroSource).toContain('import { Container } from "@/components/ui/Container"');
    expect(heroSource).toMatch(/<Container>/);
  });

  it("texto a la izquierda (acotado a un ancho máximo dentro de Container) y fotografía a la derecha (capa de fondo ocupando la mayoría de la sección), nunca una rejilla de columnas con bordes propios", () => {
    expect(heroSource).not.toMatch(/grid-cols/); // ya no es una rejilla de columnas: la foto es una capa de fondo
    expect(heroSource).toMatch(/sm:max-w-md/); // el texto sigue acotado a la izquierda
    const wrapperMatch = heroSource.match(/absolute right-0 top-0 h-full w-\[(\d+)%\]/);
    expect(wrapperMatch?.[1]).toBeTruthy();
    expect(Number(wrapperMatch?.[1])).toBeGreaterThanOrEqual(55); // la foto ocupa la mitad derecha o más
  });

  it("la fotografía se funde con el navy mediante degradados CSS reales (.hero-fade-x en escritorio, .hero-fade-y en móvil), nunca solo un cambio de color de fondo", () => {
    expect(heroSource).toContain("hero-fade-x");
    expect(heroSource).toContain("hero-fade-y");
    // Las clases de fundido viven en globals.css: aquí solo se comprueba que
    // Hero.tsx las aplique de verdad sobre una capa que cubre toda la
    // sección (absolute inset-0), nunca sobre un recuadro más pequeño.
    const fadeXMatch = heroSource.match(/className="(hero-fade-x[^"]*|[^"]*hero-fade-x[^"]*)"/);
    expect(fadeXMatch?.[1]).toMatch(/absolute inset-0/);
  });

  it("el bloque de foto de móvil nunca usa un margen negativo para sangrar hasta el borde (es hermano de Container, no un hijo con -mx-)", () => {
    expect(heroSource).not.toMatch(/-mx-\d/);
    expect(heroSource).not.toMatch(/-ml-\d|-mr-\d/);
  });

  it("globals.css: .hero-fade-x y .hero-fade-y son degradados reales (linear-gradient con paradas transparentes), nunca un simple color plano", () => {
    const fadeXBlock = globalsCssSource.match(/\.hero-fade-x\s*\{[\s\S]*?\}/)?.[0] ?? "";
    const fadeYBlock = globalsCssSource.match(/\.hero-fade-y\s*\{[\s\S]*?\}/)?.[0] ?? "";
    expect(fadeXBlock).toMatch(/linear-gradient/);
    expect(fadeXBlock).toMatch(/transparent/);
    expect(fadeYBlock).toMatch(/linear-gradient/);
    expect(fadeYBlock).toMatch(/transparent/);
  });

  it("usa coral para el CTA, como exige el encargo", () => {
    const ctaMatch = heroSource.match(/<a\s+href="\/buscar"\s+className="([^"]*)"/);
    expect(ctaMatch?.[1]).toMatch(/bg-coral-500/);
  });

  it("el titular es el primer elemento del bloque de texto (sin hueco reservado donde estaba la etiqueta retirada)", () => {
    const textBlockMatch = heroSource.match(/justify-center gap-3[^>]*>\s*<(\w+)/);
    expect(textBlockMatch?.[1]).toBe("h1");
  });

  it("mantiene la tipografía editorial serif del proyecto para el titular", () => {
    const h1Match = heroSource.match(/<h1 className="([^"]*)"/);
    expect(h1Match?.[1]).toMatch(/font-serif/);
  });

  it("no añade ninguna dependencia de animación/gestos externa (solo next/image, lucide-react y el Container propio del proyecto)", () => {
    const importedModules = [...heroSource.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    expect(importedModules.length).toBeGreaterThan(0);
    for (const specifier of importedModules) {
      expect(["next/image", "lucide-react", "@/components/ui/Container"]).toContain(specifier);
    }
  });

  it("etiqueta de descuento: texto exacto 'Hasta −70 %', colocada entre la descripción y el CTA (inmediatamente encima del botón)", () => {
    expect(heroSource).toContain("Hasta −70 %");
    const descIndex = heroSource.indexOf("Moda, hogar, tecnología");
    const tagIndex = heroSource.indexOf("Hasta −70 %");
    const ctaIndex = heroSource.indexOf('href="/buscar"');
    expect(descIndex).toBeGreaterThan(0);
    expect(tagIndex).toBeGreaterThan(descIndex);
    expect(ctaIndex).toBeGreaterThan(tagIndex);
  });

  it("la etiqueta de descuento es un <span> puramente informativo: nunca un enlace/botón, sin manejador de clic, sin recibir foco (sin tabIndex propio)", () => {
    const tagMatch = heroSource.match(/<span\s+className="([^"]*w-fit[^"]*)"\s*\n\s*aria-label="([^"]*)"/);
    expect(tagMatch).toBeTruthy();
    const [, tagClassName, ariaLabel] = tagMatch!;
    expect(ariaLabel.length).toBeGreaterThan(10); // aria-label descriptivo, no vacío
    expect(heroSource).not.toMatch(/tabIndex/); // nunca recibe foco: no es interactiva
    // El span de la etiqueta no debe llevar href/onClick (no es un <a>/<button>)
    const tagBlockMatch = heroSource.match(/<span[\s\S]*?<\/span>/);
    expect(tagBlockMatch?.[0]).not.toMatch(/href=|onClick=/);
    expect(tagClassName).toMatch(/rounded-full/); // bordes completamente redondeados
    expect(tagClassName).toMatch(/border-coral-500/); // borde coral fino, mismo color que el CTA
    expect(tagClassName).toMatch(/text-coral-500/); // texto coral
    expect(tagClassName).not.toMatch(/bg-coral/); // nunca fondo coral sólido: transparente o navy
    expect(tagClassName).not.toMatch(/shadow|rotate|animate|transition/); // sin sombra/inclinación/animación
  });

  it("la etiqueta usa el icono Tag de lucide-react (mismo sistema de iconos que ArrowRight en el CTA)", () => {
    expect(heroSource).toMatch(/import \{ ArrowRight, Tag \} from "lucide-react"/);
    expect(heroSource).toMatch(/<Tag className="[^"]*" aria-hidden="true" \/>/);
  });

  it("alineación: la etiqueta y el CTA comparten el mismo ancho ajustado al contenido (w-fit), nunca centrada ni de ancho completo, para que sus bordes izquierdos coincidan", () => {
    const tagMatch = heroSource.match(/<span\s+className="([^"]*)"\s*\n\s*aria-label/);
    expect(tagMatch?.[1]).toMatch(/\bw-fit\b/);
    expect(tagMatch?.[1]).not.toMatch(/\bmx-auto\b|\bjustify-center\b|\bw-full\b/);
  });
});

describe("page.tsx: portada usa el nuevo Hero (sustituye a los dos banners retirados)", () => {
  it("importa y renderiza <Hero />, y ya no importa PromoBannerMain/PromoBannerSecondary", () => {
    expect(pageSource).toContain('import { Hero } from "@/components/home/Hero"');
    expect(pageSource).toMatch(/<Hero\s*\/>/);
    expect(pageSource).not.toContain("PromoBannerMain");
    expect(pageSource).not.toContain("PromoBannerSecondary");
  });

  it("<Hero /> se renderiza pegado a <BrandCarousel />, nunca dentro de un <Container> (así el navy llega de lado a lado, sin margen blanco por encima ni a los lados)", () => {
    const brandCarouselIndex = pageSource.indexOf("<BrandCarousel");
    const heroIndex = pageSource.indexOf("<Hero");
    const between = pageSource.slice(brandCarouselIndex, heroIndex);
    expect(brandCarouselIndex).toBeGreaterThan(0);
    expect(heroIndex).toBeGreaterThan(brandCarouselIndex);
    expect(between).not.toContain("<Container");
  });
});
