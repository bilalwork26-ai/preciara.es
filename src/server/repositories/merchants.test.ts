import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { getActiveMerchants } from "./merchants";

const PREFIX = "test-merchants-repo";

describe.skipIf(!process.env.DATABASE_URL)("getActiveMerchants", () => {
  afterAll(async () => {
    if (!prisma) return;
    await prisma.merchant.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  });

  it("incluye un comercio real activo SIN ninguna oferta en absoluto — requisito de negocio: listar TODAS las tiendas asociadas, nunca solo las que tienen algo a la venta ahora mismo", async () => {
    const merchant = await prisma!.merchant.create({
      data: { slug: `${PREFIX}-sin-ofertas`, name: "Comercio sin ofertas", websiteUrl: "https://example.invalid", isActive: true, isDemo: false },
    });
    const rows = await getActiveMerchants();
    expect(rows).not.toBeNull();
    expect(rows!.some((m) => m.id === merchant.id)).toBe(true);
  });

  it("excluye comercios marcados isDemo (nunca catálogo de demostración mezclado con el real)", async () => {
    const demoMerchant = await prisma!.merchant.create({
      data: { slug: `${PREFIX}-demo`, name: "Comercio demo", websiteUrl: "https://example.invalid", isActive: true, isDemo: true },
    });
    const rows = await getActiveMerchants();
    expect(rows).not.toBeNull();
    expect(rows!.some((m) => m.id === demoMerchant.id)).toBe(false);
  });

  it("excluye comercios inactivos", async () => {
    const inactiveMerchant = await prisma!.merchant.create({
      data: { slug: `${PREFIX}-inactivo`, name: "Comercio inactivo", websiteUrl: "https://example.invalid", isActive: false, isDemo: false },
    });
    const rows = await getActiveMerchants();
    expect(rows).not.toBeNull();
    expect(rows!.some((m) => m.id === inactiveMerchant.id)).toBe(false);
  });

  it("ordena por nombre alfabético", async () => {
    await prisma!.merchant.createMany({
      data: [
        { slug: `${PREFIX}-orden-zeta`, name: "Zeta Tienda", websiteUrl: "https://example.invalid", isActive: true, isDemo: false },
        { slug: `${PREFIX}-orden-alfa`, name: "Alfa Tienda", websiteUrl: "https://example.invalid", isActive: true, isDemo: false },
      ],
    });
    const rows = await getActiveMerchants();
    const names = rows!.filter((m) => m.slug.startsWith(`${PREFIX}-orden`)).map((m) => m.name);
    expect(names).toEqual(["Alfa Tienda", "Zeta Tienda"]);
  });
});
