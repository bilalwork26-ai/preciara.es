import { describe, expect, it } from "vitest";
import { guides, getGuideBySlug } from "./guides";

describe("data/guides.ts: contenido editorial de las guías de compra", () => {
  it("define exactamente las tres guías con los slugs exigidos, todos únicos", () => {
    const slugs = guides.map((g) => g.slug);
    expect(slugs).toEqual([
      "como-comparar-precios-online",
      "elegir-tecnologia-reacondicionada",
      "como-comparar-electrodomesticos",
    ]);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("cada guía tiene contenido sustancial: título, descripción, tiempo de lectura, introducción y exactamente cuatro secciones con texto real", () => {
    for (const guide of guides) {
      expect(guide.title.length).toBeGreaterThan(10);
      expect(guide.description.length).toBeGreaterThan(30);
      expect(guide.readingTime).toMatch(/\d+ min/);
      expect(guide.intro.length).toBeGreaterThan(30);
      expect(guide.category.length).toBeGreaterThan(0);
      expect(guide.icon.length).toBeGreaterThan(0);

      expect(guide.sections).toHaveLength(4);
      for (const section of guide.sections) {
        expect(section.heading.length).toBeGreaterThan(5);
        expect(section.body.length).toBeGreaterThan(0);
        for (const paragraph of section.body) {
          expect(paragraph.length).toBeGreaterThan(40); // párrafo real, no un placeholder
        }
      }
    }
  });

  it("cada guía tiene una lista de comprobación con varios elementos de texto real", () => {
    for (const guide of guides) {
      expect(guide.checklist).toBeDefined();
      expect(guide.checklist!.length).toBeGreaterThanOrEqual(4);
      for (const item of guide.checklist!) {
        expect(item.length).toBeGreaterThan(10);
      }
    }
  });

  it("cada guía tiene un CTA final hacia una categoría relacionada real (o el índice de categorías), nunca una ruta de búsqueda interna ni vacía", () => {
    for (const guide of guides) {
      expect(guide.relatedHref.length).toBeGreaterThan(0);
      expect(guide.relatedHref).toMatch(/^\/(categorias|categoria\/[a-z0-9-]+)$/);
      expect(guide.relatedLabel.length).toBeGreaterThan(0);
    }
  });

  it("nunca inventa precios, descuentos, valoraciones ni nombres de tienda concretos en el contenido editorial", () => {
    const forbidden = [/\d+\s?%\s?de descuento/i, /\d+[.,]\d{2}\s?€/, /valoración de \d/i];
    for (const guide of guides) {
      const allText = [guide.title, guide.description, guide.intro, ...guide.sections.flatMap((s) => [s.heading, ...s.body])].join(" ");
      for (const pattern of forbidden) {
        expect(allText).not.toMatch(pattern);
      }
    }
  });
});

describe("getGuideBySlug: resolución segura por slug", () => {
  it("devuelve la guía correcta para un slug existente", () => {
    const guide = getGuideBySlug("como-comparar-precios-online");
    expect(guide).toBeDefined();
    expect(guide?.title).toBe("Cómo comparar precios online sin llevarte sorpresas");
  });

  it("devuelve undefined para un slug inexistente, sin lanzar", () => {
    expect(() => getGuideBySlug("slug-que-no-existe")).not.toThrow();
    expect(getGuideBySlug("slug-que-no-existe")).toBeUndefined();
  });

  it("devuelve undefined para una cadena vacía", () => {
    expect(getGuideBySlug("")).toBeUndefined();
  });
});
