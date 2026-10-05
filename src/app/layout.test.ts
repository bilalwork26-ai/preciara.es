import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `layout.tsx` importa `next/font/local`, que solo funciona dentro del
 * compilador de Next.js (no en un import directo bajo Vitest/Node
 * normal) — mismo motivo documentado en Hero.test.ts para no renderizar
 * componentes: aquí se verifica de forma estática el patrón condicional
 * de `GOOGLE_SITE_VERIFICATION` leyendo el código fuente. El comportamiento
 * real en producción (meta tag presente/ausente según la variable) queda
 * verificado con una petición HTTP real — ver el informe de la tarea.
 */
const layoutSource = readFileSync(path.resolve(import.meta.dirname, "layout.tsx"), "utf8");

describe("layout.tsx: verificación de Google Search Console, condicional y nunca inventada", () => {
  it("lee GOOGLE_SITE_VERIFICATION de las variables de entorno, nunca un valor fijo", () => {
    expect(layoutSource).toContain('process.env.GOOGLE_SITE_VERIFICATION');
  });

  it("solo añade `verification.google` a la metadata cuando la variable existe (spread condicional), nunca un código de verificación de ejemplo", () => {
    expect(layoutSource).toMatch(/\.\.\.\(googleSiteVerification \? \{ google: googleSiteVerification \} : \{\}\)/);
    // Nunca un valor de verificación hardcodeado (una cadena literal larga
    // asignada directamente a `google`), solo la variable de entorno.
    expect(layoutSource).not.toMatch(/google:\s*"[^"]+"/);
  });

  it("sigue declarando metadataBase, title (con plantilla) y openGraph, sin que el cambio los haya afectado", () => {
    expect(layoutSource).toContain("metadataBase: new URL(siteUrl)");
    expect(layoutSource).toContain('template: "%s · Preciara"');
    expect(layoutSource).toContain("openGraph:");
  });
});

describe("layout.tsx: verificación de propiedad de dominio para Admitad/Mitgo", () => {
  it("incluye la etiqueta meta mitgo-verification con el código exacto dado por Admitad/Mitgo", () => {
    expect(layoutSource).toContain('other: { "mitgo-verification": ["f98a525a-c971-45ab-9817-7226c8490247"] }');
  });
});

describe("layout.tsx: las fuentes se sirven en local, nunca desde next/font/google", () => {
  it("nunca vuelve a importar next/font/google (ese import descarga de red durante `next build` y rompió el build en Hostinger)", () => {
    expect(layoutSource).not.toMatch(/from\s+["']next\/font\/google["']/);
  });

  it("usa next/font/local para Fraunces y Plus Jakarta Sans, con los ficheros .woff2 vendidos en el repo", () => {
    expect(layoutSource).toContain('import localFont from "next/font/local"');
    expect(layoutSource).toContain("./fonts/fraunces/fraunces-latin-500-normal.woff2");
    expect(layoutSource).toContain("./fonts/plus-jakarta-sans/plus-jakarta-sans-latin-400-normal.woff2");
  });
});
