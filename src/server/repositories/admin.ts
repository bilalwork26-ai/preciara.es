import { withDb } from "@/server/db/client";
import type { Availability } from "@/generated/prisma";

export type AdminProductRow = {
  id: number;
  slug: string;
  name: string;
  brand: string | null;
  categoryName: string;
  isActive: boolean;
  isDemo: boolean;
  offerCount: number;
  updatedAt: Date;
};

/** Listado de productos para el panel técnico (activos e inactivos), con el número de ofertas de cada uno. */
export async function listProductsForAdmin(limit = 200): Promise<AdminProductRow[] | null> {
  const result = await withDb((db) =>
    db.product.findMany({
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: { category: { select: { name: true } }, _count: { select: { offers: true } } },
    })
  );
  if (!result.ok) return null;
  return result.data.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    categoryName: p.category.name,
    isActive: p.isActive,
    isDemo: p.isDemo,
    offerCount: p._count.offers,
    updatedAt: p.updatedAt,
  }));
}

export type AdminMerchantRow = {
  id: number;
  slug: string;
  name: string;
  websiteUrl: string | null;
  isActive: boolean;
  isDemo: boolean;
  offerCount: number;
  updatedAt: Date;
};

export async function listMerchantsForAdmin(limit = 200): Promise<AdminMerchantRow[] | null> {
  const result = await withDb((db) =>
    db.merchant.findMany({
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: { _count: { select: { offers: true } } },
    })
  );
  if (!result.ok) return null;
  return result.data.map((m) => ({
    id: m.id,
    slug: m.slug,
    name: m.name,
    websiteUrl: m.websiteUrl,
    isActive: m.isActive,
    isDemo: m.isDemo,
    offerCount: m._count.offers,
    updatedAt: m.updatedAt,
  }));
}

export type AdminOfferRow = {
  id: number;
  productName: string;
  merchantName: string;
  currentPrice: number;
  previousPrice: number | null;
  currency: string;
  availability: Availability;
  isActive: boolean;
  isDemo: boolean;
  lastCheckedAt: Date;
};

export async function listOffersForAdmin(limit = 300): Promise<AdminOfferRow[] | null> {
  const result = await withDb((db) =>
    db.offer.findMany({
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: { product: { select: { name: true } }, merchant: { select: { name: true } } },
    })
  );
  if (!result.ok) return null;
  return result.data.map((o) => ({
    id: o.id,
    productName: o.product.name,
    merchantName: o.merchant.name,
    currentPrice: o.currentPrice.toNumber(),
    previousPrice: o.previousPrice ? o.previousPrice.toNumber() : null,
    currency: o.currency,
    availability: o.availability,
    isActive: o.isActive,
    isDemo: o.isDemo,
    lastCheckedAt: o.lastCheckedAt,
  }));
}
