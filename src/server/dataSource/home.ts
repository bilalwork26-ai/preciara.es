/**
 * Datos de la portada: un puñado de funciones, cada una con una sola
 * responsabilidad, todas pasando por `resolveWithFallback`. `src/app/(site)/page.tsx`
 * las llama en paralelo (Promise.all) para que la portada entera dispare
 * un número pequeño y fijo de consultas (hoy: 2), nunca una por
 * componente ni una por producto.
 */
import { demoProducts, demoSupergangas } from "@/data/demo/products";
import { demoMerchants } from "@/data/demo/merchants";
import { bestOfferDiscountPercent } from "@/lib/format";
import type { Merchant, Product } from "@/types";
import { getActiveProductsWithOffers, type ProductWithOffers } from "@/server/repositories/products";
import { resolveWithFallback, type SourcedResult } from "./withFallback";
import { extractMerchants, toLegacyProduct } from "./transform";

/**
 * Curación histórica: este producto tenía su propio banner secundario en
 * la portada (ya retirado, sustituido por el hero estático único, ver
 * Hero.tsx) y por eso se excluye de "Supergangas" — se mantiene la
 * exclusión para no cambiar el catálogo que la sección muestra sin que se
 * haya pedido.
 */
const SECONDARY_BANNER_PRODUCT_SLUG = "portatil-14-16gb-512gb";

/**
 * Umbral estricto del ADELANTO de "Supergangas" en la portada (ver
 * `getSupergangasBundle`/`SupergangasGrid`): por debajo de este % de
 * descuento real, un producto nunca aparece en ese bloque de como mucho
 * `SUPERGANGAS_LIMIT` tarjetas. Bajado de 30% a 15% (ver PR
 * correspondiente) tras comprobar en producción que con el catálogo real
 * todavía pequeño (solo adidas ES + Trotec), un umbral del 30% dejaba la
 * sección casi vacía (1 producto) — 15% sigue siendo un descuento real y
 * verificado, nunca un precio inventado, solo menos exigente.
 *
 * SOLO afecta a ese adelanto curado de portada. La página completa
 * `/supergangas` (ver `getOfertasBundle`/`selectAllOfertas`) nunca aplica
 * este ni ningún otro umbral de descuento: muestra TODAS las ofertas
 * activas del catálogo, con o sin descuento — "Descubrir ofertas" (el CTA
 * del Hero que enlaza ahí) debe llevar al catálogo completo, no a un
 * listado recortado por un mínimo de descuento.
 */
export const SUPERGANGAS_MIN_DISCOUNT_PERCENT = 15;

/** Máximo de tarjetas que muestra "Supergangas" en la portada (el bloque pide "entre 6 y 8" — nunca más, puede haber menos si el catálogo no da para tantas: nunca se rellena con productos por debajo del umbral solo para completar el cupo). */
const SUPERGANGAS_LIMIT = 8;

/**
 * Cuántas filas se piden a la BD antes de deduplicar/filtrar por umbral
 * (bastante más que `SUPERGANGAS_LIMIT`): con un catálogo donde varias
 * filas son variantes de talla/color del mismo modelo (ver
 * `dealsGridGroupKey` más abajo) y donde solo una fracción del catálogo
 * llega al umbral de descuento, pedir solo `SUPERGANGAS_LIMIT` filas dejaría
 * casi siempre la sección vacía aunque el catálogo real sí tenga chollos
 * genuinos más adelante en el orden de `id`.
 */
const SUPERGANGAS_POOL_SIZE = 200;

/**
 * Clave de agrupación para no repetir el mismo modelo en varias tarjetas:
 * quita del nombre cualquier token que tenga forma de talla y normaliza
 * espacios/mayúsculas. Cuatro formas de talla confirmadas en el catálogo
 * real de Awin:
 *   - rango numérico: "23-34" ("... 23-34 Black Mujer" / "... 24-30 Black Mujer")
 *   - número con fracción: "37 1/3", "42 2/3" ("ZAPATILLA HANDBALL SPEZIAL 37 1/3" / "... 42 2/3")
 *   - talla suelta de zapatilla/ropa EU: "42" — combinada con el nombre
 *     de color, nunca confunde el color con la talla: "38 2/3 Cloud
 *     White" y "42 Cloud White" dan la misma clave ("... Pureboost 5
 *     Running 38 2/3 Cloud White" / "... Pureboost 5 Running 42 Cloud
 *     White" → la misma "Pureboost 5 Running cloud white")
 *   - talla por letra, con prefijo numérico opcional: "XS", "S", "M", "L",
 *     "XL", "XXL", "2XL", "3XL"... ("... XS Maroon" / "... 2XL Maroon")
 * Es una heurística sobre el texto real que sirve Awin (no hay un campo
 * de "modelo base" ni de talla por separado en el feed) — nunca se
 * guarda, solo decide qué mostrar en "Supergangas" (y, con el mismo
 * criterio, en `/categoria/[slug]` y `/buscar`). La talla
 * suelta de adulto (30-50) se quita siempre que aparece; un número de
 * modelo corto como el "5" de "Pureboost 5" nunca cae en ese rango, así
 * que no hace falta más cautela ahí. Las tallas infantiles/junior EU
 * (16-29 — caso real: "Zapatilla Tensaur Hook and Loop" en tallas 22 a
 * 27, seis tarjetas idénticas del mismo modelo en la parrilla) SÍ entran
 * en el mismo rango que usan bastantes nombres de modelo con un año o
 * versión al final ("Ultraboost 22"), así que solo se quitan cuando les
 * sigue más texto (color, género...) — el patrón real de Awin para
 * tallas sueltas ("42 Cloud White Hombre") siempre trae algo detrás; un
 * número de modelo al final del nombre, sin nada después, nunca se toca.
 *
 * Antes de aplicar esas reglas de talla, el nombre se normaliza (quita
 * diacríticos, unifica variantes tipográficas de guion/comillas a una
 * forma simple, quita puntuación que no distingue el modelo) y, al
 * final, también se quitan medias tallas en formato decimal ("37.5"/"38,5"
 * — alternativa real a "37 1/3" para la misma talla). Sin esto, dos filas
 * del mismo modelo podían no agruparse solo por una tilde, un guion largo
 * (–) en vez de uno normal, o una media talla en decimal en vez de
 * fracción — mismo bug de tarjetas duplicadas que esta función ya existía
 * para resolver, solo que con un margen de coincidencia más estrecho.
 */
export function dealsGridGroupKey(product: Pick<ProductWithOffers, "name">): string {
  return product.name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // diacríticos (tildes/diéresis) — mismo criterio que categoryMapping.ts
    .replace(/[“”"'`´]/g, "")
    .replace(/[–—]/g, "-") // guion medio/largo tipográfico -> guion normal, para que sigan cayendo en las reglas de rango de abajo
    .replace(/\b\d{1,3}-\d{1,3}\b/g, "")
    .replace(/\b\d{1,2}\s+\d\/\d\b/g, "")
    .replace(/\b\d{2}[.,]5\b/g, "") // media talla en formato decimal (37.5/38,5), alternativa real a "37 1/3"
    .replace(/\b(?:3\d|4\d|50)\b/g, "")
    .replace(/\b(?:1[6-9]|2\d)\b(?=\s)/g, "")
    .replace(/\b\d{0,2}X{0,3}(?:S|M|L)\b/gi, "")
    .replace(/[.,;:!¡¿?]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Mayor descuento relativo (%) entre las ofertas activas del producto; 0 si ninguna tiene `previousPrice`. */
export function bestDiscountPercent(product: ProductWithOffers): number {
  let max = 0;
  for (const offer of product.offers) {
    if (!offer.previousPrice) continue;
    const previous = offer.previousPrice.toNumber();
    if (previous <= 0) continue;
    const percent = ((previous - offer.currentPrice.toNumber()) / previous) * 100;
    if (percent > max) max = percent;
  }
  return max;
}

/**
 * Deduplica por `dealsGridGroupKey`, quedándose con la variante de mayor
 * descuento relativo de cada grupo — nunca dos tarjetas de la misma
 * prenda en distinta talla/color. Reutilizado por `selectSuperDeals`
 * (portada) y también, directamente, por `/categoria/[slug]` y `/buscar`
 * (`category.ts`/`search.ts`): esos dos listados no necesitan el umbral
 * de descuento ni el límite de abajo (muestran TODO el catálogo
 * filtrado, no un top acotado), pero sí el mismo criterio de "una sola
 * tarjeta por modelo" — repetirlo ahí sería el mismo bug de variantes
 * duplicadas que esta función ya resuelve aquí.
 *
 * El resultado se reordena por `compareByDealRank` antes de devolverlo a
 * propósito: `Map.set` sobre una clave YA existente actualiza el valor
 * pero conserva la posición de inserción ORIGINAL (la de la primera
 * variante vista de ese grupo, no la de la variante ganadora que
 * finalmente se muestra) — sin este reordenado final, `/categoria/[slug]`
 * y `/buscar` (que no vuelven a ordenar el resultado de esta función)
 * podían mostrar productos sin descuento por delante de otros con un
 * descuento real, simplemente porque su grupo se vio antes en el orden
 * de llegada. Corregirlo aquí, en el origen, evita depender de que cada
 * consumidor futuro (incluido `selectSuperDeals`, que confía en que el
 * resultado ya llegue ordenado) se acuerde de hacerlo también.
 */
export function collapseProductVariants(products: ProductWithOffers[]): ProductWithOffers[] {
  const bestPerGroup = new Map<string, ProductWithOffers>();
  for (const product of products) {
    const key = dealsGridGroupKey(product);
    const current = bestPerGroup.get(key);
    if (!current || bestDiscountPercent(product) > bestDiscountPercent(current)) {
      bestPerGroup.set(key, product);
    }
  }
  return [...bestPerGroup.values()].sort(compareByDealRank);
}

/**
 * Criterio global de "mejores chollos primero": mayor descuento relativo
 * descendente y, entre descuentos iguales (o sin descuento), el producto
 * actualizado más recientemente. Mismo criterio, y mismo motivo (que
 * funcione igual de bien con miles de productos), que el ranking en SQL de
 * `getRankedProductIds` (`server/repositories/products.ts`).
 */
function compareByDealRank(a: ProductWithOffers, b: ProductWithOffers): number {
  return bestDiscountPercent(b) - bestDiscountPercent(a) || b.updatedAt.getTime() - a.updatedAt.getTime();
}

/**
 * Comercio de la oferta que le da a `product` su `bestDiscountPercent`
 * (mismo bucle, mismo criterio de empate que esa función — ver arriba):
 * el comercio "dueño" del chollo a efectos de repartir por tienda en
 * `interleaveByMerchant`. `null` si ninguna oferta trae el campo
 * `merchant` (nunca ocurre con datos reales de Prisma — `productWithOffers`
 * siempre lo incluye — solo en fixtures de test que no lo fijan).
 */
function bestDiscountMerchantId(product: ProductWithOffers): number | null {
  let max = 0;
  let merchantId: number | null = null;
  for (const offer of product.offers) {
    if (!offer.previousPrice) continue;
    const previous = offer.previousPrice.toNumber();
    if (previous <= 0) continue;
    const percent = ((previous - offer.currentPrice.toNumber()) / previous) * 100;
    if (percent > max) {
      max = percent;
      merchantId = (offer as { merchant?: { id: number } }).merchant?.id ?? null;
    }
  }
  return merchantId;
}

/**
 * Reparte `products` round-robin por comercio (según `bestDiscountMerchantId`):
 * primero el mejor chollo de cada comercio (en el orden en que aparece
 * cada uno por primera vez — el propio comercio del chollo #1 siempre va
 * primero, así que la posición destacada sigue siendo siempre el mejor
 * descuento real de TODO el catálogo), luego el segundo mejor de cada
 * uno, y así sucesivamente. Nunca deja fuera ni rellena con nada que no
 * estuviera ya en `products` — solo reordena: con un único comercio
 * disponible, el resultado es idéntico al orden de entrada.
 *
 * Caso real que motiva esto: con dos anunciantes de Awin aprobados
 * (adidas ES y Trotec) y descuentos típicamente más agresivos en uno de
 * los dos, ordenar por descuento puro dejaba la portada con las 8
 * tarjetas del mismo comercio — nunca se veía ni un solo chollo del
 * otro, aunque existiera y cumpliera el umbral. A diferencia de la
 * antigua "Bajadas destacadas" (`selectDiverseDeals`, retirada — ver el
 * historial de este fichero), que SÍ rellenaba el cupo con productos por
 * debajo del umbral, esto nunca inventa ni degrada nada: reparte
 * exclusivamente entre chollos que YA cumplen `minDiscountPercent`.
 */
export function interleaveByMerchant(products: ProductWithOffers[]): ProductWithOffers[] {
  const groups = new Map<string, ProductWithOffers[]>();
  const order: string[] = [];
  products.forEach((product, index) => {
    const merchantId = bestDiscountMerchantId(product);
    // Sin comercio identificable (solo fixtures de test), cada producto
    // es su propio grupo de 1 — el resultado no cambia respecto al orden
    // de entrada.
    const key = merchantId !== null ? `m:${merchantId}` : `p:${index}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(product);
  });

  const result: ProductWithOffers[] = [];
  let remaining = products.length;
  while (remaining > 0) {
    for (const key of order) {
      const group = groups.get(key)!;
      if (group.length === 0) continue;
      result.push(group.shift()!);
      remaining--;
    }
  }
  return result;
}

/**
 * Elige como máximo `limit` productos para "Supergangas": deduplica
 * variantes con `collapseProductVariants` (que ya deja el resultado
 * ordenado por `compareByDealRank`, mayor descuento primero), se queda
 * solo con los que llegan a `minDiscountPercent` de descuento real, y
 * reparte el resultado entre comercios con `interleaveByMerchant` — ver
 * ahí el porqué.
 *
 * Sigue sin rellenar el hueco con productos de menor descuento solo para
 * completar el cupo: "Supergangas" es, por definición, una lista corta y
 * pura de los MEJORES chollos reales del catálogo (descuento_confirmado
 * ≥ SUPERGANGAS_MIN_DISCOUNT_PERCENT), así que puede devolver menos de
 * `limit` productos — incluso ninguno, si en ese momento el catálogo no
 * tiene ningún chollo tan agresivo — sin que eso sea un error. Inflar la
 * lista con productos que no cumplen el umbral convertiría la sección en
 * publicidad engañosa.
 */
export function selectSuperDeals(
  products: ProductWithOffers[],
  minDiscountPercent: number,
  limit: number,
): ProductWithOffers[] {
  const qualifying = collapseProductVariants(products).filter((product) => bestDiscountPercent(product) >= minDiscountPercent);
  return interleaveByMerchant(qualifying).slice(0, limit);
}

/**
 * Mismo pipeline que `selectSuperDeals` (deduplica variantes, reparte
 * entre comercios) pero SIN ningún filtro de descuento mínimo ni recorte
 * final: usada por `/supergangas` completa (ver `getOfertasBundle`), que
 * debe mostrar TODAS las ofertas activas del catálogo — con descuento
 * real, con un descuento pequeño o sin ningún descuento — nunca solo las
 * que superan un umbral. El orden (mayor descuento primero, ver
 * `compareByDealRank` dentro de `collapseProductVariants`) sigue siendo
 * el mismo que "Supergangas": los chollos más fuertes encabezan la
 * página, pero ningún producto se oculta por tener menos descuento.
 */
export function selectAllOfertas(products: ProductWithOffers[]): ProductWithOffers[] {
  return interleaveByMerchant(collapseProductVariants(products));
}

export type SupergangasBundle = { products: Product[]; merchants: Merchant[] };

export async function getSupergangasBundle(): Promise<SourcedResult<SupergangasBundle>> {
  return resolveWithFallback({
    fetchFromDb: async () => {
      const rows = await getActiveProductsWithOffers(SUPERGANGAS_POOL_SIZE);
      if (!rows) return null;
      const filtered = rows.filter((p) => p.slug !== SECONDARY_BANNER_PRODUCT_SLUG);
      const selected = selectSuperDeals(filtered, SUPERGANGAS_MIN_DISCOUNT_PERCENT, SUPERGANGAS_LIMIT);
      const products = selected.map((p) => toLegacyProduct(p));
      return { products, merchants: extractMerchants(selected) };
    },
    demoFallback: {
      // Mismo criterio que `fetchFromDb` de arriba, aplicado a mano
      // porque los productos demo usan el tipo `Product` legado (no
      // `ProductWithOffers`) y no pasan por `selectSuperDeals`:
      // - Filtro defensivo: garantiza que un futuro cambio en los precios
      //   de `demoSupergangas` nunca pueda colar, en silencio, un
      //   producto demo por debajo del umbral real.
      // - Orden por mayor descuento primero: sin esto, la tarjeta
      //   destacada (`highlight` en `ProductDealCard`, la primera del
      //   array) no sería necesariamente la de mayor descuento real.
      products: demoSupergangas
        .filter((p) => bestOfferDiscountPercent(p.offers) >= SUPERGANGAS_MIN_DISCOUNT_PERCENT)
        .sort((a, b) => bestOfferDiscountPercent(b.offers) - bestOfferDiscountPercent(a.offers))
        .slice(0, SUPERGANGAS_LIMIT),
      merchants: demoMerchants,
    },
    // "Supergangas" nunca sustituye un catálogo real (aunque esté vacío)
    // por productos inventados: con BD conectada, 0 chollos reales que
    // lleguen al umbral se muestra como 0, nunca como "Tienda Demo A/B" — eso podría
    // confundirse con una oferta real vigente. El demo solo sigue
    // sirviendo para cuando no hay BD conectada en absoluto (desarrollo
    // local sin DATABASE_URL) — ver fallbackOnlyWhenUnavailable.
    fallbackOnlyWhenUnavailable: true,
  });
}

/**
 * Cuántas filas se piden a la BD para `/supergangas` completa (ver
 * `getOfertasBundle`) — deliberadamente mucho más alto que
 * `SUPERGANGAS_POOL_SIZE`: esa otra constante existe para alimentar un
 * FILTRO de descuento mínimo que ya reduce mucho el conjunto antes de
 * mostrarlo, pero esta página ya no aplica ningún filtro de descuento
 * (ver `selectAllOfertas`) — debe poder servir el catálogo activo
 * COMPLETO, así que necesita un tope mucho más generoso para que un
 * catálogo que crezca a miles de productos siga mostrándose entero. Sigue
 * siendo un tope técnico de seguridad (una consulta nunca debe ser
 * literalmente sin límite), no un recorte de catálogo a propósito.
 */
const OFERTAS_PAGE_POOL_SIZE = 5000;

export type OfertasBundle = { products: Product[]; merchants: Merchant[] };

/**
 * Listado completo de "Supergangas" para `/supergangas` (el destino del
 * CTA "Descubrir ofertas" del Hero y de la píldora "Supergangas" de la
 * navegación): a diferencia del adelanto curado de portada
 * (`getSupergangasBundle`, como mucho `SUPERGANGAS_LIMIT` tarjetas y solo
 * con descuento ≥ `SUPERGANGAS_MIN_DISCOUNT_PERCENT`), esta página NUNCA
 * aplica un umbral de descuento mínimo: muestra TODAS las ofertas activas
 * del catálogo, de todas las tiendas, con descuento real, con un
 * descuento pequeño o sin ningún descuento — ordenadas por mayor
 * descuento primero (ver `selectAllOfertas`/`compareByDealRank`), pero
 * sin ocultar nada por debajo de ningún porcentaje.
 */
export async function getOfertasBundle(): Promise<SourcedResult<OfertasBundle>> {
  return resolveWithFallback({
    fetchFromDb: async () => {
      const rows = await getActiveProductsWithOffers(OFERTAS_PAGE_POOL_SIZE);
      if (!rows) return null;
      const filtered = rows.filter((p) => p.slug !== SECONDARY_BANNER_PRODUCT_SLUG);
      const selected = selectAllOfertas(filtered);
      const products = selected.map((p) => toLegacyProduct(p));
      return { products, merchants: extractMerchants(selected) };
    },
    demoFallback: {
      // A diferencia del adelanto de portada (que usa `demoSupergangas`,
      // una lista aparte curada con descuentos altos), esta página usa el
      // catálogo demo GENERAL (`demoProducts`): sin filtro de descuento,
      // "todas las ofertas activas" en modo demo son todos los productos
      // demo, no solo los ya curados como chollos. Mismo orden que con BD
      // real: mayor descuento primero, sin ocultar los que no tienen.
      products: [...demoProducts].sort((a, b) => bestOfferDiscountPercent(b.offers) - bestOfferDiscountPercent(a.offers)),
      merchants: demoMerchants,
    },
    // "Supergangas" nunca sustituye un catálogo real (aunque esté vacío)
    // por productos inventados: con BD conectada, 0 productos activos se
    // muestra como 0, nunca como "Tienda Demo A/B". El demo solo sigue
    // sirviendo para cuando no hay BD conectada en absoluto (desarrollo
    // local sin DATABASE_URL).
    fallbackOnlyWhenUnavailable: true,
  });
}
