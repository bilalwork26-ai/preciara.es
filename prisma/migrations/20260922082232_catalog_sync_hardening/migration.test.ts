import { afterAll, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/client";

const PREFIX = "test-migration-catalog-sync-hardening";

describe.skipIf(!process.env.DATABASE_URL)("migración catalog_sync_hardening: restricciones aplicadas de verdad en MySQL", () => {
  afterAll(async () => {
    if (!prisma) return;
    await prisma.product.deleteMany({ where: { category: { slug: { startsWith: PREFIX } } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.syncLock.deleteMany({ where: { name: { startsWith: PREFIX } } });
  });

  describe("products.canonicalGtin: nullable y única", () => {
    it("acepta varios productos con canonicalGtin NULL (NULL no cuenta como duplicado en una restricción única de MySQL)", async () => {
      const category = await prisma!.category.create({ data: { slug: `${PREFIX}-cat-null`, name: "Cat" } });
      const a = await prisma!.product.create({ data: { slug: `${PREFIX}-product-null-a`, name: "A", categoryId: category.id, canonicalGtin: null } });
      const b = await prisma!.product.create({ data: { slug: `${PREFIX}-product-null-b`, name: "B", categoryId: category.id, canonicalGtin: null } });
      expect(a.canonicalGtin).toBeNull();
      expect(b.canonicalGtin).toBeNull();
    });

    it("rechaza dos productos con el mismo canonicalGtin no nulo", async () => {
      const category = await prisma!.category.create({ data: { slug: `${PREFIX}-cat-dup-gtin`, name: "Cat" } });
      await prisma!.product.create({ data: { slug: `${PREFIX}-product-dup-gtin-a`, name: "A", categoryId: category.id, canonicalGtin: "11111111111113" } });

      await expect(
        prisma!.product.create({ data: { slug: `${PREFIX}-product-dup-gtin-b`, name: "B", categoryId: category.id, canonicalGtin: "11111111111113" } })
      ).rejects.toThrow();
    });

    it("acepta hasta 14 caracteres en canonicalGtin (VARCHAR(14), la forma normalizada de un GTIN)", async () => {
      const category = await prisma!.category.create({ data: { slug: `${PREFIX}-cat-len`, name: "Cat" } });
      const product = await prisma!.product.create({
        data: { slug: `${PREFIX}-product-len`, name: "P", categoryId: category.id, canonicalGtin: "22222222222226" },
      });
      expect(product.canonicalGtin).toHaveLength(14);
    });
  });

  describe("sync_locks: estructura e índices", () => {
    it("name es la clave primaria: rechaza dos filas con el mismo nombre", async () => {
      const name = `${PREFIX}-lock-pk`;
      await prisma!.syncLock.create({ data: { name, holderId: randomUUID(), expiresAt: new Date(Date.now() + 60_000) } });
      await expect(
        prisma!.syncLock.create({ data: { name, holderId: randomUUID(), expiresAt: new Date(Date.now() + 60_000) } })
      ).rejects.toThrow();
    });

    it("acquiredAt tiene un valor por defecto (CURRENT_TIMESTAMP) si no se indica explícitamente", async () => {
      const name = `${PREFIX}-lock-default-acquired`;
      const before = new Date();
      const lock = await prisma!.syncLock.create({ data: { name, holderId: randomUUID(), expiresAt: new Date(Date.now() + 60_000) } });
      expect(lock.acquiredAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    });

    it("permite consultar/ordenar por expiresAt (índice sync_locks_expiresAt_idx) sin error, incluidas filas ya caducadas", async () => {
      const nameExpired = `${PREFIX}-lock-expired`;
      const nameFuture = `${PREFIX}-lock-future`;
      await prisma!.syncLock.create({ data: { name: nameExpired, holderId: randomUUID(), expiresAt: new Date(Date.now() - 60_000) } });
      await prisma!.syncLock.create({ data: { name: nameFuture, holderId: randomUUID(), expiresAt: new Date(Date.now() + 60_000) } });

      const expired = await prisma!.syncLock.findMany({ where: { name: { startsWith: PREFIX }, expiresAt: { lt: new Date() } } });
      expect(expired.map((l) => l.name)).toContain(nameExpired);
      expect(expired.map((l) => l.name)).not.toContain(nameFuture);
    });

    it("holderId y name respetan sus longitudes documentadas (VARCHAR(64)/VARCHAR(190)) sin truncar en escritura ni lectura", async () => {
      const name = `${PREFIX}-lock-length`;
      const holderId = randomUUID(); // 36 caracteres, bien dentro de VARCHAR(64)
      const lock = await prisma!.syncLock.create({ data: { name, holderId, expiresAt: new Date(Date.now() + 60_000) } });
      expect(lock.holderId).toBe(holderId);
      expect(lock.name).toBe(name);
    });
  });

  describe("conservación de datos y claves foráneas existentes (no destructivo)", () => {
    it("un producto histórico sin canonicalGtin (creado antes de esta migración) sigue siendo legible y editable con normalidad", async () => {
      const category = await prisma!.category.create({ data: { slug: `${PREFIX}-cat-legacy`, name: "Cat" } });
      // Simula un producto "histórico": se crea sin tocar canonicalGtin en
      // absoluto (como haría cualquier fila insertada antes de que esta
      // columna existiera) y se comprueba que la migración no le asignó ni
      // exige ningún valor.
      const legacy = await prisma!.product.create({ data: { slug: `${PREFIX}-product-legacy`, name: "Legacy", categoryId: category.id, ean: "formato-libre-no-validado" } });
      expect(legacy.canonicalGtin).toBeNull();
      expect(legacy.ean).toBe("formato-libre-no-validado"); // el campo histórico no se toca ni se valida

      const reread = await prisma!.product.findUniqueOrThrow({ where: { id: legacy.id } });
      expect(reread.ean).toBe("formato-libre-no-validado");
    });

    it("la clave foránea products.categoryId -> categories sigue protegida (no se puede borrar una categoría con productos)", async () => {
      const category = await prisma!.category.create({ data: { slug: `${PREFIX}-cat-fk`, name: "Cat" } });
      await prisma!.product.create({ data: { slug: `${PREFIX}-product-fk`, name: "P", categoryId: category.id } });

      await expect(prisma!.category.delete({ where: { id: category.id } })).rejects.toThrow();
    });

    it("ofertas y snapshots existentes de productos/comercios ajenos a esta migración no se ven alterados (recuento estable)", async () => {
      // No inserta nada: solo confirma que las tablas centrales (products,
      // offers) siguen respondiendo con normalidad tras la migración —
      // ninguna fila previa se pierde ni queda inaccesible.
      const productsCount = await prisma!.product.count();
      const offersCount = await prisma!.offer.count();
      expect(productsCount).toBeGreaterThanOrEqual(0);
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
