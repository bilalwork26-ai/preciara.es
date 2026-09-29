const ASIN_RE = /^[A-Z0-9]{10}$/;

/**
 * URL de afiliado de Amazon ES a partir de un ASIN, usando el Tag de
 * Afiliado configurado en `NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG` (público
 * por diseño: un Tag de Afiliado siempre viaja visible en la propia URL,
 * nunca es un secreto — por eso usa el prefijo `NEXT_PUBLIC_`, a
 * diferencia de las claves de Awin). Sin la variable configurada, o con
 * un ASIN que no tiene la forma esperada (10 caracteres alfanuméricos),
 * devuelve `null`: nunca se inventa un tag ni se construye un enlace que
 * no vaya a funcionar.
 *
 * Nota: no hay todavía ningún adaptador que traiga productos reales de
 * Amazon (ver el comentario de `OfferSource` en schema.prisma) — esta
 * función queda lista para cuando exista, pero hoy no la llama ningún
 * flujo real.
 */
export function buildAmazonAffiliateUrl(asin: string): string | null {
  const tag = process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG?.trim();
  const normalizedAsin = asin.trim().toUpperCase();
  if (!tag || !ASIN_RE.test(normalizedAsin)) return null;
  return `https://www.amazon.es/dp/${normalizedAsin}?tag=${encodeURIComponent(tag)}`;
}
