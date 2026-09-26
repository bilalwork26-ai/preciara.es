import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `layout.tsx` importa `next/font/google`, que solo funciona dentro del
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
    expect(layoutSource).toMatch(/\.\.\.\(googleSiteVerification \? \{ verification: \{ google: googleSiteVerification \} \} : \{\}\)/);
    // Nunca un valor de verificación hardcodeado (una cadena literal larga
    // asignada directamente a `verification`), solo la variable de entorno.
    expect(layoutSource).not.toMatch(/verification:\s*\{\s*google:\s*"[^"]+"/);
  });

  it("sigue declarando metadataBase, title (con plantilla) y openGraph, sin que el cambio los haya afectado", () => {
    expect(layoutSource).toContain("metadataBase: new URL(siteUrl)");
    expect(layoutSource).toContain('template: "%s · Preciara"');
    expect(layoutSource).toContain("openGraph:");
  });
});
