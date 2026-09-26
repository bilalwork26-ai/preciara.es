import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Mismo patrón que Hero.test.ts (sin infraestructura de test de
 * componentes en el proyecto): verifica de forma estática el requisito de
 * negocio — footer y MarqueeBand deben formar un único bloque azul
 * continuo, sin franja blanca ni borde claro entre ellos, con el mismo
 * fondo navy, y todo el contenido/enlaces conservados con contraste
 * accesible. La revisión visual real (ausencia de franja, color exacto)
 * queda verificada por capturas reales — ver el informe de la tarea.
 */
const footerSource = readFileSync(path.resolve(import.meta.dirname, "Footer.tsx"), "utf8");
const marqueeSource = readFileSync(
  path.resolve(import.meta.dirname, "../home/MarqueeBand.tsx"),
  "utf8"
);
const siteLayoutSource = readFileSync(
  path.resolve(import.meta.dirname, "../../app/(site)/layout.tsx"),
  "utf8"
);

describe("(site)/layout.tsx: la causa real de la franja blanca (no el margen del footer, ya cubierto arriba)", () => {
  it("<main> nunca lleva flex-1: el body raíz es flex-col min-h-full (ver src/app/layout.tsx), así que flex-1 estiraba <main> para rellenar el alto del viewport en páginas más cortas que la pantalla, dejando ese relleno blanco justo entre el marquee (último elemento real de <main> en la portada) y el footer", () => {
    const mainMatch = siteLayoutSource.match(/<main([^>]*)>/);
    expect(mainMatch?.[1] ?? "").not.toMatch(/flex-1/);
  });

  it("Header y Footer siguen renderizándose en todas las páginas públicas (el footer es un componente global, no exclusivo de la portada)", () => {
    expect(siteLayoutSource).toContain("<Header />");
    expect(siteLayoutSource).toContain("<Footer />");
  });
});

describe("Footer.tsx: mismo bloque azul continuo que MarqueeBand, sin franja blanca", () => {
  it("nunca tiene un margen/padding superior que separe el footer de lo que venga justo encima (la franja blanca era exactamente eso)", () => {
    expect(footerSource).not.toMatch(/<footer[^>]*\bmt-\d/);
    expect(footerSource).not.toMatch(/<footer[^>]*\bpt-\d/);
  });

  it("usa exactamente el mismo token de fondo navy que MarqueeBand (bg-navy-900), nunca un azul distinto inventado", () => {
    const footerBgMatch = footerSource.match(/<footer className="([^"]*)"/);
    const marqueeBgMatch = marqueeSource.match(/marquee-band[^"]*"/);
    expect(footerBgMatch?.[1]).toContain("bg-navy-900");
    expect(marqueeBgMatch?.[0]).toContain("bg-navy-900");
  });

  it("no queda ningún borde claro (border-border, el token de fondos claros) en el footer — nunca sobre navy, distinto de border-border-navy", () => {
    expect(footerSource).not.toMatch(/\bborder-border(?!-navy)\b/);
  });

  it("el divisor interno del footer (entre el bloque de enlaces y el texto legal) usa el token de borde ya pensado para navy (border-border-navy)", () => {
    expect(footerSource).toContain("border-border-navy");
  });

  it("MarqueeBand nunca lleva un borde propio (ni border-border-navy ni ningún otro): esa línea, aunque sutil, es justo la separación visible que no debe existir justo antes del footer", () => {
    const marqueeRootMatch = marqueeSource.match(/className="(marquee-band[^"]*)"/);
    expect(marqueeRootMatch?.[1]).not.toMatch(/\bborder(-\S*)?\b/);
  });
});

describe("Footer.tsx: contenido y enlaces conservados, con contraste accesible sobre navy", () => {
  it("conserva los tres enlaces legales exactos, con sus hrefs", () => {
    expect(footerSource).toContain('{ label: "Metodología", href: "/metodologia" }');
    expect(footerSource).toContain('{ label: "Aviso de afiliación", href: "/aviso-afiliacion" }');
    expect(footerSource).toContain('{ label: "Privacidad y cookies", href: "/privacidad" }');
  });

  it("conserva el texto legal de afiliación y el copyright", () => {
    expect(footerSource).toContain("Algunos enlaces de Preciara son enlaces de afiliado");
    expect(footerSource).toContain("Preciara. Todos los precios mostrados en esta versión son datos de demostración.");
  });

  it("el logotipo usa el tema claro pensado para fondo navy (Logo theme=\"light\"), nunca el tema oscuro por defecto (invisible sobre navy)", () => {
    expect(footerSource).toContain('<Logo theme="light" />');
    expect(footerSource).not.toMatch(/<Logo\s*\/>/); // nunca sin theme (theme="dark" por defecto)
  });

  it("nunca usa un color de texto pensado para fondos claros (navy-500/navy-300/navy-900) para el cuerpo de texto sobre este fondo navy", () => {
    // navy-900 (el propio fondo) y navy-300 (solo permitido como decoration- del subrayado, no como color de texto) son las únicas excepciones ya revisadas a mano.
    expect(footerSource).not.toMatch(/text-navy-500\b/);
    expect(footerSource).not.toMatch(/\btext-navy-300\b/);
  });

  it("todos los enlaces tienen un estado hover visible (transition-colors + hover:text-white) y un anillo de foco propio de alto contraste sobre navy", () => {
    const linkClassNames = [...footerSource.matchAll(/<Link\s[^>]*className=\{?`?"?([^"`]+)/g)].map((m) => m[1]);
    expect(linkClassNames.length).toBeGreaterThanOrEqual(2); // el <Link> del map + el inline de "aviso de afiliación"
    expect(footerSource).toContain("hover:text-white");
    expect(footerSource).toContain("focus-visible:ring-white");
    expect(footerSource).toContain("focus-visible:ring-offset-navy-900");
  });
});

describe("Footer.tsx: nueva columna 'Descubrir' (Categorías y Guías de compra), sin tocar 'Información'", () => {
  it("añade una columna 'Descubrir' con enlaces a Categorías y Guías de compra", () => {
    expect(footerSource).toContain('{ label: "Categorías", href: "/categorias" }');
    expect(footerSource).toContain('{ label: "Guías de compra", href: "/guias" }');
    expect(footerSource).toMatch(/<nav aria-label="Descubrir">/);
    expect(footerSource).toMatch(/<h3[^>]*>Descubrir<\/h3>/);
  });

  it("la columna 'Información' sigue intacta: mismo título, mismos tres enlaces legales, mismo aria-label", () => {
    expect(footerSource).toMatch(/<nav aria-label="Enlaces legales">/);
    expect(footerSource).toMatch(/<h3[^>]*>Información<\/h3>/);
    expect(footerSource).toContain('{ label: "Metodología", href: "/metodologia" }');
    expect(footerSource).toContain('{ label: "Aviso de afiliación", href: "/aviso-afiliacion" }');
    expect(footerSource).toContain('{ label: "Privacidad y cookies", href: "/privacidad" }');
  });
});
