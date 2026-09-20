/**
 * Seed idempotente de Preciara (Fase 2A).
 *
 * Carga en la base de datos exactamente los mismos datos de demostración
 * que ya usa la web (`src/data/demo/*`), marcados con `isDemo: true` en
 * comercios, productos y ofertas para que nunca se confundan con datos
 * reales. Ejecutarlo varias veces no duplica nada: cada entidad se
 * localiza por su clave estable (slug, o producto+comercio para las
 * ofertas) y se actualiza con `upsert`; el historial de precios solo se
 * inserta la primera vez que una oferta no tiene ningún `PriceSnapshot`.
 *
 * Uso: `npm run db:seed` (invoca `prisma db seed`, que ejecuta este
 * fichero con `tsx`). Requiere `DATABASE_URL` configurada.
 */
import { PrismaClient, Availability } from "../src/generated/prisma";
import { demoCategories } from "../src/data/demo/categories";
import { demoMerchants } from "../src/data/demo/merchants";
import { demoProducts } from "../src/data/demo/products";

const prisma = new PrismaClient();

/** "hace 12 min" / "hace 2 h" -> Date real (aproximada) en el pasado. Si no reconoce el formato, usa la hora actual. */
function parseRelativeLabel(label: string, now: Date): Date {
  const minutesMatch = label.match(/hace\s+(\d+)\s*min/i);
  if (minutesMatch) return new Date(now.getTime() - Number(minutesMatch[1]) * 60_000);

  const hoursMatch = label.match(/hace\s+(\d+)\s*h/i);
  if (hoursMatch) return new Date(now.getTime() - Number(hoursMatch[1]) * 3_600_000);

  return now;
}

async function main() {
  const now = new Date();
  console.log("[seed] Iniciando carga idempotente de datos de demostración...");

  // --- Categorías ---
  const categoryIdBySlug = new Map<string, number>();
  for (const category of demoCategories) {
    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name },
      create: { slug: category.slug, name: category.name, isActive: true },
    });
    categoryIdBySlug.set(category.id, row.id);
  }
  console.log(`[seed] Categorías: ${demoCategories.length} verificadas/creadas.`);

  // --- Comercios (demo) ---
  const merchantIdBySlug = new Map<string, number>();
  for (const merchant of demoMerchants) {
    const row = await prisma.merchant.upsert({
      where: { slug: merchant.slug },
      update: { name: merchant.name, isDemo: true },
      create: {
        slug: merchant.slug,
        name: merchant.name,
        // Dominio reservado por RFC 2606 para que nunca resuelva ni se confunda con una tienda real.
        websiteUrl: `https://${merchant.slug}.example.invalid`,
        isActive: true,
        isDemo: true,
      },
    });
    merchantIdBySlug.set(merchant.id, row.id);
  }
  console.log(`[seed] Comercios demo: ${demoMerchants.length} verificados/creados.`);

  // --- Productos, ofertas e historial (demo) ---
  let offersCreatedOrUpdated = 0;
  let snapshotsCreated = 0;

  for (const product of demoProducts) {
    const categoryId = categoryIdBySlug.get(product.categoryId);
    if (!categoryId) {
      throw new Error(`[seed] Categoría desconocida para el producto demo "${product.slug}": ${product.categoryId}`);
    }

    const productRow = await prisma.product.upsert({
      where: { slug: product.slug },
      update: { name: product.name, categoryId, isDemo: true },
      create: {
        slug: product.slug,
        name: product.name,
        categoryId,
        isActive: true,
        isDemo: true,
      },
    });

    for (const offer of product.offers) {
      const merchantId = merchantIdBySlug.get(offer.merchantId);
      if (!merchantId) {
        throw new Error(`[seed] Comercio desconocido para la oferta demo "${offer.id}": ${offer.merchantId}`);
      }

      const offerRow = await prisma.offer.upsert({
        where: { productId_merchantId: { productId: productRow.id, merchantId } },
        update: {
          currentPrice: offer.price,
          previousPrice: offer.previousPrice ?? null,
          currency: offer.currency,
          productUrl: offer.url,
          availability: offer.inStock ? Availability.IN_STOCK : Availability.OUT_OF_STOCK,
          lastCheckedAt: parseRelativeLabel(offer.lastCheckedLabel, now),
          isActive: true,
          isDemo: true,
        },
        create: {
          productId: productRow.id,
          merchantId,
          currentPrice: offer.price,
          previousPrice: offer.previousPrice ?? null,
          currency: offer.currency,
          productUrl: offer.url,
          availability: offer.inStock ? Availability.IN_STOCK : Availability.OUT_OF_STOCK,
          lastCheckedAt: parseRelativeLabel(offer.lastCheckedLabel, now),
          isActive: true,
          isDemo: true,
        },
      });
      offersCreatedOrUpdated += 1;

      // Historial de precios: solo se siembra la primera vez (si la oferta
      // todavía no tiene ningún snapshot), para que ejecutar el seed varias
      // veces no duplique el histórico. Se adjunta a la oferta más barata
      // del producto, que es la que representa el gráfico en la portada.
      const isCheapestOffer = offer.price === Math.min(...product.offers.map((o) => o.price));
      if (isCheapestOffer) {
        const existingSnapshots = await prisma.priceSnapshot.count({ where: { offerId: offerRow.id } });
        if (existingSnapshots === 0 && product.priceHistory.length > 0) {
          await prisma.priceSnapshot.createMany({
            data: product.priceHistory.map((point) => ({
              offerId: offerRow.id,
              price: point.price,
              availability: Availability.IN_STOCK,
              recordedAt: new Date(point.date),
            })),
          });
          snapshotsCreated += product.priceHistory.length;
        }
      }
    }
  }

  console.log(`[seed] Productos demo: ${demoProducts.length} verificados/creados.`);
  console.log(`[seed] Ofertas demo verificadas/creadas: ${offersCreatedOrUpdated}.`);
  console.log(`[seed] Snapshots de historial insertados en esta ejecución: ${snapshotsCreated}.`);
  console.log("[seed] Completado. Todos los datos cargados están marcados isDemo = true.");
}

main()
  .catch((error) => {
    console.error("[seed] Error durante la carga de datos:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
