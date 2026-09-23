/**
 * Serializa datos estructurados (JSON-LD) para incrustar en un
 * `<script type="application/ld+json">`. Escapa `<` (p. ej. de un
 * `</script>` dentro de un nombre de producto/comercio real) para que
 * nunca pueda cerrar la etiqueta antes de tiempo — mismo riesgo, misma
 * solución estándar, que un XSS por HTML sin escapar.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
