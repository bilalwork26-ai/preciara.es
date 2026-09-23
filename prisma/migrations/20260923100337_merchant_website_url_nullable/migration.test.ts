import { afterAll, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { prisma } from "@/server/db/client";

const PREFIX = "test-migration-merchant-website-url-nullable";

describe.skipIf(!process.env.DATABASE_URL)("migración merchant_website_url_nullable: restricción aplicada de verdad en MySQL", () => {
  afterAll(async () => {
    if (!prisma) return;
    await prisma.merchant.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  });

  describe("merchants.websiteUrl: ahora nulo, sin dejar de aceptar un valor real", () => {
    it("acepta crear un comercio con websiteUrl NULL", async () => {
      const merchant = await prisma!.merchant.create({
        data: { slug: `${PREFIX}-null`, name: "Comercio sin web conocida", websiteUrl: null },
      });
      expect(merchant.websiteUrl).toBeNull();

      const reread = await prisma!.merchant.findUniqueOrThrow({ where: { id: merchant.id } });
      expect(reread.websiteUrl).toBeNull();
    });

    it("sigue aceptando un websiteUrl real (comportamiento histórico sin cambios)", async () => {
      const merchant = await prisma!.merchant.create({
        data: { slug: `${PREFIX}-real`, name: "Comercio con web", websiteUrl: "https://example.invalid" },
      });
      expect(merchant.websiteUrl).toBe("https://example.invalid");
    });

    it("permite actualizar un comercio existente de un valor real a NULL, y de NULL a un valor real", async () => {
      const merchant = await prisma!.merchant.create({
        data: { slug: `${PREFIX}-update`, name: "Comercio actualizable", websiteUrl: "https://example.invalid" },
      });

      const cleared = await prisma!.merchant.update({ where: { id: merchant.id }, data: { websiteUrl: null } });
      expect(cleared.websiteUrl).toBeNull();

      const restored = await prisma!.merchant.update({ where: { id: merchant.id }, data: { websiteUrl: "https://example.invalid/de-nuevo" } });
      expect(restored.websiteUrl).toBe("https://example.invalid/de-nuevo");
    });
  });

  describe("conservación de datos existentes (no destructiva)", () => {
    it("un comercio histórico con websiteUrl ya establecido (creado antes de esta migración) sigue siendo legible y editable con normalidad", async () => {
      // Simula un comercio "histórico": se crea con un websiteUrl real, como
      // haría cualquier fila insertada antes de que esta columna admitiera
      // NULL, y se comprueba que la migración no le tocó el valor.
      const legacy = await prisma!.merchant.create({
        data: { slug: `${PREFIX}-legacy`, name: "Comercio histórico", websiteUrl: "https://legacy.example.invalid" },
      });
      expect(legacy.websiteUrl).toBe("https://legacy.example.invalid");

      const reread = await prisma!.merchant.findUniqueOrThrow({ where: { id: legacy.id } });
      expect(reread.websiteUrl).toBe("https://legacy.example.invalid");
    });

    it("comercios y ofertas existentes ajenos a esta migración no se ven alterados (recuento estable)", async () => {
      const merchantsCount = await prisma!.merchant.count();
      const offersCount = await prisma!.offer.count();
      expect(merchantsCount).toBeGreaterThanOrEqual(0);
      expect(offersCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe("aplicación limpia y ausencia de drift", () => {
    it("`prisma migrate status` confirma que el esquema de la base coincide con las migraciones (sin cambios pendientes)", () => {
      const output = execSync("npx prisma migrate status", { encoding: "utf8", timeout: 30_000 });
      expect(output).toMatch(/up to date/i);
    });

    it("`prisma migrate diff` entre el esquema y la base de datos no detecta diferencias", () => {
      // --exit-code: 0 si no hay diferencias, 2 si las hay (execSync lanza
      // en cualquier código de salida distinto de 0, así que un `throw` aquí
      // ya sería la prueba fallando por drift real).
      const output = execSync(
        "npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code",
        { encoding: "utf8", timeout: 30_000 }
      );
      expect(output).toMatch(/no difference/i);
    });
  });
});
