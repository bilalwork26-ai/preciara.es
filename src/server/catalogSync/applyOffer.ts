/**
 * Núcleo de aplicación de una oferta normalizada (Awin/eBay, todavía sin
 * conectar) contra la base de datos. Análogo a `applyRow` del importador
 * CSV (`src/server/importer/run.ts`), pero operando sobre la forma
 * canónica `NormalizedOfferRow` y con las reglas propias de este núcleo:
 *
 *   - Identidad de la oferta = (source, merchantId, externalId), siempre
 *     con externalId presente (a diferencia del CSV histórico).
 *   - Coincidencia de producto por GTIN válido idéntico (normalizado) si
 *     lo hay; si no, identidad estable por (source, merchant, externalId)
 *     — la propia oferta — para no unir ni duplicar productos. La
 *     coincidencia por GTIN se hace contra `Product.canonicalGtin`, con
 *     restricción única a nivel de base de datos: la resolución de "oferta
 *     nunca vista" es una creación optimista que, si pierde la carrera
 *     contra otra sincronización concurrente para el mismo GTIN, relee al
 *     ganador en vez de duplicar (ver `findOrCreateProductByCanonicalGtin`).
 *   - Si una oferta ya conocida se creó sin GTIN y una sincronización
 *     posterior aporta uno válido, se intenta relacionarla de forma segura
 *     con el producto canónico existente para ese GTIN — nunca por
 *     coincidencia aproximada de texto, y nunca si hay ambigüedad (el
 *     producto actual ya tiene su propio GTIN distinto). La decisión
 *     siempre se registra para auditoría (`ApplyOfferOutcome.gtinRelink`,
 *     persistido como `ImportError` no bloqueante por `syncRun.ts`) y
 *     nunca se borra el producto que pueda quedar huérfano tras un relink
 *     (ver `resolveLateGtinForExistingProduct`).
 *   - Los metadatos compartidos del producto (name/brand/model/imageUrl/
 *     ean/canonicalGtin) se resuelven con la política determinista de
 *     prioridad de fuente (ver metadataPolicy.ts), nunca con una
 *     sobrescritura ciega.
 *   - Los campos propios de la oferta (precio, disponibilidad...) siempre
 *     reflejan la fila más reciente: no hay "oscilación" que evitar ahí,
 *     es justo el propósito de sincronizar.
 */
import type { PrismaClient, Product, Category } from "@/generated/prisma";
import { isUniqueConstraintViolationOn } from "@/server/db/prismaErrors";
import { normalizeGtinOrNull } from "./gtin";
import { resolveProductMetadata } from "./metadataPolicy";
import { validateNormalizedOfferRow } from "./validation";
import type { NormalizedOfferRow } from "./types";

/**
 * Decisión de relación tardía de GTIN (punto 10), siempre registrada para
 * auditoría cuando ocurre — nunca aplicada en silencio.
 */
export type GtinRelinkDecision =
  | { code: "GTIN_RELINK_CLAIMED"; normalizedGtin: string; productId: number }
  | { code: "GTIN_RELINK_APPLIED"; normalizedGtin: string; fromProductId: number; toProductId: number }
  | { code: "GTIN_RELINK_AMBIGUOUS_SKIPPED"; normalizedGtin: string; productId: number; existingCanonicalGtin: string };

export type ApplyOfferOutcome = {
  product: "created" | "updated";
  merchant: "created" | "updated";
  offer: "created" | "updated";
  gtinRelink?: GtinRelinkDecision;
};

/** `true` si el P2002 recibido es (o probablemente es) por la restricción única de `Product.canonicalGtin`. */
function isCanonicalGtinConflict(error: unknown): boolean {
  return isUniqueConstraintViolationOn(error, "canonicalGtin");
}

/**
 * Busca una categoría por slug o la crea, de forma atómica y segura frente
 * a carreras: si dos sincronizaciones concurrentes de fuentes distintas
 * (p. ej. Awin y eBay) intentan crear la MISMA categoría nueva a la vez, la
 * restricción única de `Category.slug` garantiza que como mucho una de las
 * dos consigue escribir su fila — la otra recibe un conflicto P2002, relee
 * quién ganó la carrera y usa esa categoría en su lugar. Precargar la
 * categoría de antemano no resuelve esto (solo lo esconde en las pruebas):
 * la resolución tiene que ser atómica de verdad, igual que
 * `findOrCreateProductByCanonicalGtin`.
 */
async function findOrCreateCategory(db: PrismaClient, slug: string, name: string): Promise<Category> {
  const existing = await db.category.findUnique({ where: { slug } });
  if (existing) return existing;

  try {
    return await db.category.create({ data: { slug, name } });
  } catch (error) {
    if (!isUniqueConstraintViolationOn(error, "slug")) throw error;
    const winner = await db.category.findUnique({ where: { slug } });
    // Si no hay ganador, el P2002 no era por el slug de la categoría: no
    // hay nada que resolver aquí, se relanza el error original.
    if (!winner) throw error;
    return winner;
  }
}

/** Genera un slug de producto estable y sin colisiones cuando no hay GTIN que lo relacione con uno existente. */
function deriveExternalProductSlug(row: NormalizedOfferRow): string {
  const raw = `ext-${row.source.toLowerCase()}-${row.merchant.slug}-${row.externalId}`;
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

/**
 * Busca un producto por GTIN canónico o lo crea (punto 8: dos
 * sincronizaciones concurrentes de fuentes distintas no pueden crear dos
 * `Product` para el mismo GTIN). La creación es optimista: si dos
 * sincronizaciones concurrentes (p. ej. Awin y eBay a la vez) intentan
 * crear un producto para el mismo GTIN al mismo tiempo, la restricción
 * única de `canonicalGtin` en base de datos garantiza que como mucho una
 * de las dos consigue escribir su fila — la otra recibe un conflicto
 * P2002, relee quién ganó la carrera y usa ese producto en su lugar. Nunca
 * puede quedar un producto duplicado para el mismo GTIN, sin importar el
 * orden de llegada.
 */
async function findOrCreateProductByCanonicalGtin(
  db: PrismaClient,
  normalizedGtin: string,
  row: NormalizedOfferRow,
  categoryId: number
): Promise<{ product: Product; created: boolean }> {
  const existing = await db.product.findFirst({ where: { canonicalGtin: normalizedGtin } });
  if (existing) return { product: existing, created: false };

  const slug = deriveExternalProductSlug(row);
  try {
    const created = await db.product.create({
      data: {
        slug,
        name: row.name,
        brand: row.brand,
        model: row.model,
        imageUrl: row.imageUrl,
        ean: normalizedGtin,
        canonicalGtin: normalizedGtin,
        categoryId,
        isDemo: false,
        metadataSource: row.source,
      },
    });
    return { product: created, created: true };
  } catch (error) {
    if (!isCanonicalGtinConflict(error)) throw error;
    const winner = await db.product.findFirst({ where: { canonicalGtin: normalizedGtin } });
    // Si no hay ganador, el P2002 no era por canonicalGtin (p. ej. una
    // colisión de slug ajena a esta carrera): no hay nada que resolver
    // aquí, se relanza el error original.
    if (!winner) throw error;
    return { product: winner, created: false };
  }
}

/**
 * Punto 10 (GTIN que aparece posteriormente): dado el producto actual de
 * una oferta ya conocida y un GTIN válido recién aportado, decide si
 * relacionarla de forma segura con un producto canónico existente para ese
 * GTIN, dejarla reclamarlo en solitario, o no hacer nada por ambigüedad —
 * nunca por coincidencia aproximada de texto. La decisión se devuelve
 * siempre que implique algo distinto de "ya coincidía" para que quien
 * llama la registre en auditoría.
 *
 * En `dryRun` no escribe nada (ni el `update` de "reclamar", ni el
 * `offer.update` de reasignar el producto — eso lo hace quien llama):
 * solo lee lo necesario para poder anticipar/reportar la misma decisión.
 */
async function resolveLateGtinForExistingProduct(
  db: PrismaClient,
  currentProduct: Product,
  normalizedGtin: string,
  { dryRun }: { dryRun: boolean }
): Promise<{ product: Product; decision?: GtinRelinkDecision }> {
  if (currentProduct.canonicalGtin === normalizedGtin) {
    return { product: currentProduct }; // ya coincidía: nada que hacer ni que registrar
  }

  if (currentProduct.canonicalGtin !== null) {
    // El producto ya tiene su propia identidad de GTIN, distinta de la
    // entrante: nunca se fusiona automáticamente por ambigüedad.
    return {
      product: currentProduct,
      decision: {
        code: "GTIN_RELINK_AMBIGUOUS_SKIPPED",
        normalizedGtin,
        productId: currentProduct.id,
        existingCanonicalGtin: currentProduct.canonicalGtin,
      },
    };
  }

  // currentProduct.canonicalGtin === null: todavía sin identidad de GTIN propia.
  const other = await db.product.findFirst({ where: { canonicalGtin: normalizedGtin } });
  if (other && other.id !== currentProduct.id) {
    // Ya existe un producto canónico distinto para este GTIN: relaciona la
    // oferta con él de forma segura. El producto anterior NUNCA se borra
    // ni se modifica aquí — puede quedar huérfano, y eso es intencional
    // (nunca se borran productos automáticamente).
    return {
      product: other,
      decision: { code: "GTIN_RELINK_APPLIED", normalizedGtin, fromProductId: currentProduct.id, toProductId: other.id },
    };
  }

  if (dryRun) {
    return { product: currentProduct, decision: { code: "GTIN_RELINK_CLAIMED", normalizedGtin, productId: currentProduct.id } };
  }

  try {
    const claimed = await db.product.update({ where: { id: currentProduct.id }, data: { canonicalGtin: normalizedGtin } });
    return { product: claimed, decision: { code: "GTIN_RELINK_CLAIMED", normalizedGtin, productId: claimed.id } };
  } catch (error) {
    if (!isCanonicalGtinConflict(error)) throw error;
    // Carrera perdida entre nuestro findFirst y nuestro update: otra
    // sincronización reclamó este GTIN justo ahora. Releemos al ganador y
    // lo tratamos como un relink seguro (nuestro producto sigue sin tocar).
    const winner = await db.product.findFirst({ where: { canonicalGtin: normalizedGtin } });
    if (!winner || winner.id === currentProduct.id) throw error;
    return {
      product: winner,
      decision: { code: "GTIN_RELINK_APPLIED", normalizedGtin, fromProductId: currentProduct.id, toProductId: winner.id },
    };
  }
}

/**
 * Aplica una fila ya validada. En modo `dryRun` solo lee para clasificar
 * creación/actualización, sin escribir nada — igual que el importador CSV.
 */
export async function applyNormalizedOfferRow(
  db: PrismaClient,
  row: NormalizedOfferRow,
  { dryRun }: { dryRun: boolean }
): Promise<ApplyOfferOutcome> {
  validateNormalizedOfferRow(row);

  // --- Categoría: se crea si hace falta (la fuente siempre aporta nombre); resolución atómica frente a carreras (bloqueo 1 de la segunda ronda). ---
  let categoryId: number;
  if (dryRun) {
    const existingCategory = await db.category.findUnique({ where: { slug: row.category.slug } });
    categoryId = existingCategory?.id ?? -1;
  } else {
    categoryId = (await findOrCreateCategory(db, row.category.slug, row.category.name)).id;
  }

  // --- Comercio: solo se rellenan huecos, nunca se sobrescribe con vacío. ---
  const existingMerchant = await db.merchant.findUnique({ where: { slug: row.merchant.slug } });
  let merchantId: number;
  let merchantOutcome: ApplyOfferOutcome["merchant"];
  if (dryRun) {
    merchantId = existingMerchant?.id ?? -1;
    merchantOutcome = existingMerchant ? "updated" : "created";
  } else if (existingMerchant) {
    merchantId = existingMerchant.id;
    await db.merchant.update({
      where: { id: existingMerchant.id },
      data: {
        name: row.merchant.name || existingMerchant.name,
        websiteUrl: row.merchant.websiteUrl || existingMerchant.websiteUrl,
        logoUrl: existingMerchant.logoUrl ?? row.merchant.logoUrl ?? null,
      },
    });
    merchantOutcome = "updated";
  } else {
    merchantId = (
      await db.merchant.create({
        data: {
          slug: row.merchant.slug,
          name: row.merchant.name,
          websiteUrl: row.merchant.websiteUrl,
          logoUrl: row.merchant.logoUrl ?? null,
          isDemo: false,
        },
      })
    ).id;
    merchantOutcome = "created";
  }

  const normalizedGtin = normalizeGtinOrNull(row.gtin);

  // --- Oferta existente: identidad = (source, merchant, externalId), SIEMPRE con externalId. ---
  const existingOffer = await db.offer.findUnique({
    where: { source_merchantId_externalId: { source: row.source, merchantId, externalId: row.externalId } },
  });

  let productId: number;
  let productOutcome: ApplyOfferOutcome["product"];
  let gtinRelinkDecision: GtinRelinkDecision | undefined;

  if (existingOffer) {
    // Re-sincronización de una oferta ya conocida: el producto al que
    // apunta NO se re-resuelve por GTIN salvo la única excepción explícita
    // del punto 10 (GTIN aportado tardíamente sobre una oferta que se creó
    // sin él) — nunca se re-evalúa de otra forma, para no arriesgarse a
    // "fusionar" productos que ya se decidió mantener separados.
    let targetProduct = await db.product.findUniqueOrThrow({ where: { id: existingOffer.productId } });

    if (normalizedGtin) {
      const relinkResult = await resolveLateGtinForExistingProduct(db, targetProduct, normalizedGtin, { dryRun });
      gtinRelinkDecision = relinkResult.decision;
      targetProduct = relinkResult.product;
      if (!dryRun && targetProduct.id !== existingOffer.productId) {
        await db.offer.update({ where: { id: existingOffer.id }, data: { productId: targetProduct.id } });
      }
    }

    productId = targetProduct.id;
    const resolved = resolveProductMetadata(
      {
        name: targetProduct.name,
        brand: targetProduct.brand,
        model: targetProduct.model,
        imageUrl: targetProduct.imageUrl,
        ean: targetProduct.ean,
        canonicalGtin: targetProduct.canonicalGtin,
        metadataSource: targetProduct.metadataSource,
      },
      { source: row.source, name: row.name, brand: row.brand, model: row.model, imageUrl: row.imageUrl, normalizedGtin }
    );
    if (!dryRun) {
      await db.product.update({
        where: { id: productId },
        data: {
          name: resolved.name,
          brand: resolved.brand,
          model: resolved.model,
          imageUrl: resolved.imageUrl,
          ean: resolved.ean,
          canonicalGtin: resolved.canonicalGtin,
          metadataSource: resolved.metadataSource,
          categoryId,
        },
      });
    }
    productOutcome = "updated";
  } else if (normalizedGtin) {
    // Oferta nunca vista, con GTIN válido: resuelve/crea el producto de
    // forma atómica y segura frente a carreras (punto 8) — nunca por
    // coincidencia aproximada de nombre/marca/modelo (punto 6).
    if (dryRun) {
      const matched = await db.product.findFirst({ where: { canonicalGtin: normalizedGtin } });
      productId = matched?.id ?? -1;
      productOutcome = matched ? "updated" : "created";
    } else {
      const { product, created } = await findOrCreateProductByCanonicalGtin(db, normalizedGtin, row, categoryId);
      productId = product.id;
      if (created) {
        productOutcome = "created";
      } else {
        const resolved = resolveProductMetadata(
          {
            name: product.name,
            brand: product.brand,
            model: product.model,
            imageUrl: product.imageUrl,
            ean: product.ean,
            canonicalGtin: product.canonicalGtin,
            metadataSource: product.metadataSource,
          },
          { source: row.source, name: row.name, brand: row.brand, model: row.model, imageUrl: row.imageUrl, normalizedGtin }
        );
        await db.product.update({
          where: { id: productId },
          data: {
            name: resolved.name,
            brand: resolved.brand,
            model: resolved.model,
            imageUrl: resolved.imageUrl,
            ean: resolved.ean,
            canonicalGtin: resolved.canonicalGtin,
            metadataSource: resolved.metadataSource,
          },
        });
        productOutcome = "updated";
      }
    }
  } else {
    // Oferta nunca vista, sin GTIN: identidad estable derivada de la
    // propia oferta (fuente + comercio + id externo) — nunca se intenta
    // relacionar por texto (punto 6).
    const slug = deriveExternalProductSlug(row);
    if (dryRun) {
      productId = -1;
    } else {
      productId = (
        await db.product.create({
          data: {
            slug,
            name: row.name,
            brand: row.brand,
            model: row.model,
            imageUrl: row.imageUrl,
            ean: null,
            canonicalGtin: null,
            categoryId,
            isDemo: false,
            metadataSource: row.source,
          },
        })
      ).id;
    }
    productOutcome = "created";
  }

  // --- Oferta: los campos operativos siempre reflejan la fila más reciente. ---
  const offerData = {
    currentPrice: row.price,
    currency: row.currency,
    productUrl: row.productUrl,
    affiliateUrl: row.affiliateUrl,
    availability: row.availability,
    shippingCost: row.shippingCost,
    lastCheckedAt: row.fetchedAt,
    isActive: true,
    isDemo: false,
  };

  let offerId: number;
  let offerOutcome: ApplyOfferOutcome["offer"];
  if (dryRun) {
    offerId = existingOffer?.id ?? -1;
    offerOutcome = existingOffer ? "updated" : "created";
  } else if (existingOffer) {
    offerId = existingOffer.id;
    const priceChangedForHistory = existingOffer.currentPrice.toNumber() !== row.price;
    await db.offer.update({
      where: { id: existingOffer.id },
      data: {
        ...offerData,
        previousPrice: priceChangedForHistory ? existingOffer.currentPrice : existingOffer.previousPrice,
      },
    });
    offerOutcome = "updated";
  } else {
    offerId = (
      await db.offer.create({
        data: { productId, merchantId, source: row.source, externalId: row.externalId, previousPrice: null, ...offerData },
      })
    ).id;
    offerOutcome = "created";
  }

  if (!dryRun) {
    const lastSnapshot = await db.priceSnapshot.findFirst({ where: { offerId }, orderBy: { recordedAt: "desc" } });
    const priceChanged = !lastSnapshot || lastSnapshot.price.toNumber() !== row.price;
    const availabilityChanged = !lastSnapshot || lastSnapshot.availability !== row.availability;
    if (priceChanged || availabilityChanged) {
      await db.priceSnapshot.create({
        data: { offerId, price: row.price, shippingCost: row.shippingCost, availability: row.availability, recordedAt: row.fetchedAt },
      });
    }
  }

  return { product: productOutcome, merchant: merchantOutcome, offer: offerOutcome, gtinRelink: gtinRelinkDecision };
}
