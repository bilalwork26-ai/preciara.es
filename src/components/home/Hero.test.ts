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
    expect(heroSource).toContain("Compara y ahorra");
    expect(heroSource).toContain("Los mejores productos. Las mejores ofertas.");
    expect(heroSource).toContain("Moda, hogar, tecnología, belleza y mucho más, comparado para ti.");
    expect(heroSource).toContain("Descubrir ofertas");
    expect(heroSource).toContain("Precios claros · Varias tiendas");
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

  it("usa una única fotografía real (next/image), nunca productos/capas separados", () => {
    expect(heroSource).toContain('import Image from "next/image"');
    const imageTagCount = (heroSource.match(/<Image\s/g) ?? []).length;
    expect(imageTagCount).toBe(1);
    expect(heroSource).toContain("/images/home/hero-lifestyle-collection-v1.webp");
  });

  it("la fotografía usa object-cover recortado a la derecha (mismo archivo y mismo recorte en todos los anchos, nunca una segunda composición)", () => {
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

  it("tarjeta única azul marino, con esquinas redondeadas y la proporción de columnas 42/58 exigida en escritorio", () => {
    expect(heroSource).toContain("bg-navy-900");
    expect(heroSource).toContain("rounded-[2rem]");
    expect(heroSource).toContain("overflow-hidden");
    expect(heroSource).toMatch(/sm:grid-cols-\[42fr_58fr\]/);
  });

  it("usa teal para el distintivo y coral para el CTA, como exige el encargo", () => {
    const badgeMatch = heroSource.match(/<span className="([^"]*)">\s*Compara y ahorra/);
    expect(badgeMatch?.[1]).toMatch(/bg-teal-600/);
    const ctaMatch = heroSource.match(/<a\s+href="\/buscar"\s+className="([^"]*)"/);
    expect(ctaMatch?.[1]).toMatch(/bg-coral-500/);
  });

  it("mantiene la tipografía editorial serif del proyecto para el titular", () => {
    const h1Match = heroSource.match(/<h1 className="([^"]*)"/);
    expect(h1Match?.[1]).toMatch(/font-serif/);
  });

  it("no añade ninguna dependencia de animación/gestos externa (solo React, next/image y lucide-react, ya propios del proyecto)", () => {
    const importedModules = [...heroSource.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    expect(importedModules.length).toBeGreaterThan(0);
    for (const specifier of importedModules) {
      expect(["next/image", "lucide-react"]).toContain(specifier);
    }
  });
});

describe("page.tsx: portada usa el nuevo Hero (sustituye a los dos banners retirados)", () => {
  it("importa y renderiza <Hero />, y ya no importa PromoBannerMain/PromoBannerSecondary", () => {
    expect(pageSource).toContain('import { Hero } from "@/components/home/Hero"');
    expect(pageSource).toMatch(/<Hero\s*\/>/);
    expect(pageSource).not.toContain("PromoBannerMain");
    expect(pageSource).not.toContain("PromoBannerSecondary");
  });
});
