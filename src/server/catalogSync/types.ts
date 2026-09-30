/**
 * Forma canónica, independiente de fuente, para una fila de oferta que
 * cualquier adaptador (Awin, eBay... todavía sin conectar) debe producir
 * antes de entregarla al núcleo de sincronización (`applyOffer.ts`). El
 * importador CSV histórico (`src/server/importer/*`) sigue con su propio
 * `NormalizedOfferRow` específico de CSV — no se ha tocado — y queda fuera
 * de este tipo a propósito (ver README/decisiones de la rama
 * feat/catalog-sync-core).
 */
import { Availability, OfferSource } from "@/generated/prisma";

export { OfferSource };

/** Comercio al que pertenece la oferta. El adaptador decide slug/nombre estables para su fuente. */
export type NormalizedMerchant = {
  slug: string;
  name: string;
  /** `null` si la fuente no aporta un sitio web de comercio fiable (p. ej. el adaptador de Awin: ni la lista de feeds ni las columnas del feed de productos incluyen jamás la web de la tienda) — nunca se inventa un valor. */
  websiteUrl: string | null;
  logoUrl?: string | null;
};

/** Categoría del catálogo a la que pertenece el producto. */
export type NormalizedCategory = {
  slug: string;
  name: string;
};

export type NormalizedOfferRow = {
  /** Qué sistema aporta esta fila. */
  source: OfferSource;
  merchant: NormalizedMerchant;
  /**
   * Identificador propio de la fuente para esta oferta concreta (SKU, id de
   * listado de Awin/eBay...). A diferencia del importador CSV histórico,
   * aquí es SIEMPRE obligatorio: es la base de la identidad estable de la
   * oferta (fuente + comercio + externalId) — ver applyOffer.ts.
   */
  externalId: string;
  /** GTIN/EAN en bruto tal como lo aporta la fuente, sin validar todavía (ver gtin.ts). `null` si la fuente no lo aporta. */
  gtin: string | null;
  name: string;
  brand: string | null;
  model: string | null;
  category: NormalizedCategory;
  imageUrl: string | null;
  /** Precio actual, en la unidad menor habitual (p. ej. 19.99), nunca negativo. */
  price: number;
  /**
   * Precio de referencia ("antes de la rebaja") que la propia fuente
   * declara para esta fila, si lo trae — p. ej. la columna `rrp_price`
   * del feed de Awin. `null` si la fuente no lo aporta.
   *
   * NUNCA se usa directamente como `Offer.previousPrice`: solo sirve como
   * señal inicial para una oferta que Preciara ve por primera vez (o que
   * todavía no tiene ningún descuento propio observado), y solo si es
   * estrictamente mayor que `price` — ver `applyOffer.ts`. El histórico
   * real de precio (la bajada que Preciara observa entre dos
   * sincronizaciones propias) sigue siendo la fuente de verdad una vez
   * que existe; este campo nunca la sobrescribe. Sin esto, un comercio
   * recién conectado (su primera sincronización) no tiene ningún
   * descuento que mostrar hasta que su precio cambie una segunda vez
   * respecto a lo que Preciara ya había visto — puede tardar semanas,
   * aunque el propio comercio ya muestre una rebaja real en su feed
   * desde el primer día.
   */
  referencePrice: number | null;
  shippingCost: number | null;
  /** Código ISO 4217 de 3 letras, p. ej. "EUR". */
  currency: string;
  availability: Availability;
  productUrl: string;
  affiliateUrl: string | null;
  /** Cuándo se obtuvo este dato de la fuente (no la hora de procesarlo en Preciara). */
  fetchedAt: Date;
};

export class NormalizedOfferRowError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
