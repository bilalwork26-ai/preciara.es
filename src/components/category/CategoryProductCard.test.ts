import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Sin infraestructura de test de componentes en el proyecto (mismo patrón
 * que el resto de `*.test.ts` junto a componentes): se verifica de forma
 * estática que la tarjeta nunca enlaza a `/producto/[slug]` cuando el
 * producto no tiene ninguna oferta activa — `getProductDetail` trata esos
 * productos como 404 (mismo criterio que el sitemap), así que un enlace
 * ahí sería un enlace roto. Caso real desde que `/categoria/[slug]`
 * muestra el catálogo completo (con o sin oferta, ver getCategoryDetail),
 * no solo lo que ya tenía oferta activa.
 */
const source = readFileSync(path.resolve(import.meta.dirname, "CategoryProductCard.tsx"), "utf8");

describe("CategoryProductCard.tsx", () => {
  it("sin ninguna oferta activa (best es undefined), renderiza un <div>, nunca un <Link> a una ficha que daría 404", () => {
    expect(source).toMatch(/if \(!best\) \{\s*return <div className=\{cardClassName\}>\{cardContent\}<\/div>;\s*\}/);
  });

  it("con alguna oferta activa, sigue enlazando a la ficha de producto como siempre", () => {
    expect(source).toMatch(/<Link href=\{`\/producto\/\$\{product\.slug\}`\}/);
  });

  it("muestra un aviso explícito cuando no hay ninguna oferta activa, en vez de dejar un hueco vacío sin explicación", () => {
    expect(source).toContain("Sin oferta activa ahora mismo");
  });
});
