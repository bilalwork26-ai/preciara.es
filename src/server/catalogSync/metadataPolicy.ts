/**
 * Política determinista de prioridad de metadatos (punto 7): cuando varias
 * fuentes aportan datos distintos del mismo producto, decide qué fuente
 * "posee" los campos compartidos (name/brand/model/imageUrl) en cada
 * momento, para que:
 *
 *   - un valor con contenido nunca se reemplace por uno vacío;
 *   - los campos no oscilen en cada sincronización porque dos fuentes se
 *     turnan para actualizar el mismo producto.
 *
 * Regla (documentada, con una prioridad fija y editable en un solo sitio —
 * `SOURCE_PRIORITY` abajo):
 *
 *   1. Si el producto no tiene todavía `metadataSource` (nunca lo tocó el
 *      núcleo nuevo — p. ej. viene del importador CSV histórico o del
 *      seed), la fuente entrante toma posesión y escribe sus valores.
 *   2. Si la fuente entrante es la MISMA que ya posee los metadatos, se
 *      actualiza con sus valores más recientes (una fuente siempre puede
 *      refinar sus propios datos).
 *   3. Si la fuente entrante tiene prioridad ESTRICTAMENTE MAYOR que la
 *      dueña actual, toma posesión (una fuente más fiable corrige a una
 *      menos fiable).
 *   4. En cualquier otro caso (fuente de prioridad menor o igual, y no es
 *      la dueña), NO toma posesión de los campos "core" — pero SÍ puede
 *      rellenar huecos: cualquier campo individual que esté vacío se
 *      completa con su valor, sin cambiar quién es el dueño.
 *
 * `ean` y `canonicalGtin` tienen su propia regla, más simple y sin relación
 * con la prioridad de fuente: un GTIN no cambia para un mismo producto
 * físico, así que solo se rellenan si están vacíos y nunca se sobrescriben
 * después (ver `resolveEan`/`resolveCanonicalGtin`). `canonicalGtin` es la
 * clave real de coincidencia entre fuentes (ver applyOffer.ts); `ean` se
 * mantiene en paralelo solo por compatibilidad con el importador CSV
 * histórico y la vista del producto.
 */
import { OfferSource } from "@/generated/prisma";

/** Más fiable primero. Único sitio donde se decide este orden. */
const SOURCE_PRIORITY: OfferSource[] = [OfferSource.CSV, OfferSource.AWIN, OfferSource.EBAY];

function priorityRank(source: OfferSource): number {
  const index = SOURCE_PRIORITY.indexOf(source);
  return index === -1 ? SOURCE_PRIORITY.length : index; // fuente desconocida = mínima prioridad, nunca -1/crash
}

export type ExistingProductMetadata = {
  name: string;
  brand: string | null;
  model: string | null;
  imageUrl: string | null;
  ean: string | null;
  canonicalGtin: string | null;
  metadataSource: OfferSource | null;
};

export type IncomingProductMetadata = {
  source: OfferSource;
  name: string;
  brand: string | null;
  model: string | null;
  imageUrl: string | null;
  /** GTIN ya normalizado (ver gtin.ts), o `null` si la fuente no lo aporta o no es válido. */
  normalizedGtin: string | null;
};

export type ResolvedProductMetadata = {
  name: string;
  brand: string | null;
  model: string | null;
  imageUrl: string | null;
  ean: string | null;
  canonicalGtin: string | null;
  metadataSource: OfferSource | null;
};

function takesOwnership(existing: ExistingProductMetadata, incomingSource: OfferSource): boolean {
  if (!existing.metadataSource) return true; // nadie es dueño todavía
  if (existing.metadataSource === incomingSource) return true; // la misma fuente refina lo suyo
  return priorityRank(incomingSource) < priorityRank(existing.metadataSource); // estrictamente mayor prioridad
}

/** Nunca sobrescribe un EAN ya guardado (un GTIN no cambia); solo lo rellena si está vacío. */
function resolveEan(existingEan: string | null, incomingNormalizedGtin: string | null): string | null {
  return existingEan ?? incomingNormalizedGtin ?? null;
}

/** Igual que `resolveEan`, pero para la columna nueva `canonicalGtin` (ver schema.prisma). Backfill-only, nunca sobrescribe. */
function resolveCanonicalGtin(existingCanonicalGtin: string | null, incomingNormalizedGtin: string | null): string | null {
  return existingCanonicalGtin ?? incomingNormalizedGtin ?? null;
}

/**
 * Combina los metadatos existentes de un producto con los que aporta una
 * fila entrante, sin mutar ninguno de los dos parámetros.
 */
export function resolveProductMetadata(
  existing: ExistingProductMetadata,
  incoming: IncomingProductMetadata
): ResolvedProductMetadata {
  const ean = resolveEan(existing.ean, incoming.normalizedGtin);
  const canonicalGtin = resolveCanonicalGtin(existing.canonicalGtin, incoming.normalizedGtin);

  if (takesOwnership(existing, incoming.source)) {
    return {
      name: incoming.name,
      brand: incoming.brand,
      model: incoming.model,
      imageUrl: incoming.imageUrl,
      ean,
      canonicalGtin,
      metadataSource: incoming.source,
    };
  }

  // No toma posesión: mantiene lo existente, pero rellena huecos
  // individuales con lo que aporte la fila entrante (nunca sobrescribe un
  // valor con contenido).
  return {
    name: existing.name, // "name" nunca está vacío por diseño del esquema; no hay hueco que rellenar
    brand: existing.brand ?? incoming.brand,
    model: existing.model ?? incoming.model,
    imageUrl: existing.imageUrl ?? incoming.imageUrl,
    ean,
    canonicalGtin,
    metadataSource: existing.metadataSource,
  };
}
