import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { marqueeMessages } from "@/data/marquee";

/**
 * Mismo patrón que Hero.test.ts (sin infraestructura de test de
 * componentes en el proyecto): verifica de forma estática el requisito de
 * negocio — una única línea (nunca dos), en dorado, con puntos
 * separadores dorados, textos exactos, y sin volver a un aspecto de
 * cartel publicitario. La revisión visual real (movimiento suave, fundido
 * en los extremos) queda verificada por capturas reales — ver el informe
 * de la tarea.
 */
const marqueeSource = readFileSync(path.resolve(import.meta.dirname, "MarqueeBand.tsx"), "utf8");
const footerSource = readFileSync(
  path.resolve(import.meta.dirname, "../layout/Footer.tsx"),
  "utf8"
);
const globalsCssSource = readFileSync(
  path.resolve(import.meta.dirname, "../../app/globals.css"),
  "utf8"
);

describe("data/marquee.ts: los cuatro mensajes exactos, en una única lista", () => {
  it("contiene exactamente los cuatro mensajes exigidos, en el orden exacto", () => {
    expect(marqueeMessages).toEqual([
      "PRECIARA",
      "PRECIOS CLAROS PARA COMPRAR MEJOR",
      "COMPARA ANTES DE COMPRAR",
      "TU AHORRO EMPIEZA CON INFORMACIÓN",
    ]);
  });
});

describe("MarqueeBand.tsx: una única línea fina, dorada, nunca dos", () => {
  it("importa una única lista de mensajes (marqueeMessages), nunca dos listas separadas (primaria/secundaria)", () => {
    expect(marqueeSource).toContain("marqueeMessages");
    expect(marqueeSource).not.toContain("marqueePrimaryMessages");
    expect(marqueeSource).not.toContain("marqueeSecondaryMessages");
  });

  it("renderiza el grupo de mensajes exactamente dos veces (el original + su duplicado para el bucle continuo), nunca una segunda línea distinta", () => {
    const groupCalls = (marqueeSource.match(/<MarqueeGroup\b/g) ?? []).length;
    expect(groupCalls).toBe(2);
    expect(marqueeSource).not.toContain("MarqueeLine"); // el componente de "línea" (uno por fila) ya no existe: solo hay un grupo de texto
  });

  it("el texto de cada mensaje es dorado cálido (bg-gold-400 nunca inventa otro azul/coral ajeno a la paleta), nunca blanco ni navy-100 como antes", () => {
    expect(marqueeSource).toContain("text-gold-400");
    expect(marqueeSource).not.toMatch(/text-white\b/);
    expect(marqueeSource).not.toMatch(/text-navy-100\b/);
  });

  it("separa las frases con un punto pequeño dorado (círculo, nunca la chispa/estrella coral anterior)", () => {
    expect(marqueeSource).toContain("bg-gold-400");
    expect(marqueeSource).toMatch(/rounded-full/);
    expect(marqueeSource).not.toContain("MarqueeSeparator");
    expect(marqueeSource).not.toMatch(/text-coral-500/);
    expect(marqueeSource).not.toMatch(/<svg/); // el separador ya no es un SVG con forma de estrella
  });

  it("texto pequeño y ligero (nunca tamaños grandes ni negrita, para evitar la apariencia de cartel publicitario)", () => {
    const textSpanMatch = marqueeSource.match(/text-\[(\d+)px\][^"]*text-gold-400/);
    expect(textSpanMatch).toBeTruthy();
    expect(Number(textSpanMatch?.[1])).toBeLessThanOrEqual(11); // texto pequeño (antes text-xs = 12px)
    expect(marqueeSource).not.toMatch(/text-(xs|sm|base|lg|xl|2xl|3xl)\b/); // ningún tamaño de la escala estándar: es más pequeño que text-xs
    expect(marqueeSource).not.toMatch(/\bfont-bold\b/); // ni siquiera font-semibold de antes: ahora font-medium, "ligero"
    expect(marqueeSource).not.toMatch(/\bfont-semibold\b/);
  });

  it("altura total de cinta fina: 28–36px, muy por debajo de la banda anterior (52–60px) y muchísimo más que las dos líneas originales", () => {
    const heightMatch = marqueeSource.match(/min-h-\[(\d+)px\]/);
    expect(heightMatch).toBeTruthy();
    expect(Number(heightMatch?.[1])).toBeGreaterThanOrEqual(28);
    expect(Number(heightMatch?.[1])).toBeLessThanOrEqual(36);
  });

  it("dos líneas horizontales finas y discretas encuadran la cinta (una arriba, una abajo) — dorado apagado a baja opacidad, nunca blancas ni gruesas", () => {
    const hairlineMatches = [...marqueeSource.matchAll(/className="([^"]*\bh-px\b[^"]*)"/g)];
    expect(hairlineMatches.length).toBe(2); // una arriba (top-0), una abajo (bottom-0)
    const classNames = hairlineMatches.map((m) => m[1]);
    expect(classNames.some((c) => c.includes("top-0"))).toBe(true);
    expect(classNames.some((c) => c.includes("bottom-0"))).toBe(true);
    for (const c of classNames) {
      expect(c).not.toMatch(/bg-white/); // nunca blancas
      expect(c).toMatch(/bg-gold-600\/\d+|bg-navy-\d+\/\d+/); // dorado apagado u navy más claro, siempre con opacidad reducida
    }
  });

  it("sigue usando el mecanismo de movimiento continuo por CSS ya existente (marquee-track / marquee-line), sin JavaScript ni estado de React", () => {
    expect(marqueeSource).not.toContain('"use client"');
    expect(marqueeSource).not.toMatch(/useState|useEffect|useRef/);
    expect(marqueeSource).toContain("marquee-track");
    expect(marqueeSource).toContain("marquee-line");
  });

  it("nunca tiene un borde inferior propio (border-b/border-y): ese borde dejaba una línea visible entre la marquesina y el footer justo debajo", () => {
    const rootMatch = marqueeSource.match(/className="(marquee-band[^"]*)"/);
    expect(rootMatch?.[1]).not.toMatch(/\bborder(-\S*)?\b/);
  });
});

describe("La marquesina y el footer siguen sin ningún hueco/borde visible entre ellos (regla ya validada en Footer.test.ts, reconfirmada aquí desde el lado de la marquesina)", () => {
  it("MarqueeBand y Footer usan exactamente el mismo fondo navy (bg-navy-900)", () => {
    expect(marqueeSource).toContain("bg-navy-900");
    expect(footerSource).toContain("bg-navy-900");
  });
});

describe("globals.css: el fundido en los extremos de la marquesina ya existe (mask-image de .marquee-line) y sigue respetando prefers-reduced-motion", () => {
  it(".marquee-line sigue teniendo su mask-image de fundido en ambos extremos", () => {
    expect(globalsCssSource).toContain(
      "mask-image: linear-gradient(to right, transparent, black 8%, black 92%, transparent);"
    );
  });

  it("prefers-reduced-motion sigue desactivando la animación de .marquee-track por completo", () => {
    // Bloque exacto ya existente en globals.css (última regla del fichero,
    // dedicada por completo a la marquesina): se comprueba tal cual, sin
    // depender de que no haya otros `@media (prefers-reduced-motion)` antes
    // en el fichero (el del carrusel, más arriba, es un bloque distinto).
    expect(globalsCssSource).toContain(
      "@media (prefers-reduced-motion: reduce) {\n  .marquee-track {\n    animation: none !important;"
    );
  });
});
