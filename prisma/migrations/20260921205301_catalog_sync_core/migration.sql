-- Núcleo de sincronización de catálogos externos (Awin/eBay, todavía sin
-- conectar): añade la noción de "fuente" (OfferSource) a las ofertas,
-- sustituye la identidad única de una oferta de (producto, comercio) por
-- (fuente, comercio, id externo) para permitir varias ofertas del mismo
-- comercio cuando son anuncios distintos, y añade la tabla de
-- configuración de cadencia por fuente. Ninguna operación de este fichero
-- borra datos ni tablas.
--
-- Orden deliberado: se crea el nuevo índice simple sobre `productId` ANTES
-- de borrar el índice único antiguo `offers_productId_merchantId_key`, para
-- que las claves foráneas de `offers` (productId y merchantId) nunca se
-- queden sin un índice que las respalde y MySQL no necesite tocarlas.
-- (`prisma migrate diff` genera un script que sí las toca y se deja sin
-- recrear la de `productId` — comprobado en una base de pruebas aislada;
-- este fichero se ha escrito y verificado a mano para evitarlo.)

-- AlterTable: nueva columna `source` en `offers`, con valor por defecto
-- CSV para que todas las filas ya existentes (importadas por el CSV
-- histórico) queden correctamente etiquetadas sin necesitar backfill.
ALTER TABLE `offers` ADD COLUMN `source` ENUM('CSV', 'AWIN', 'EBAY') NOT NULL DEFAULT 'CSV';

-- AlterTable: nueva columna `metadataSource` en `products` (nullable: los
-- productos existentes, creados antes de este cambio, quedan `NULL` =
-- "todavía sin sincronizar por el núcleo nuevo").
ALTER TABLE `products` ADD COLUMN `metadataSource` ENUM('CSV', 'AWIN', 'EBAY') NULL;

-- CreateIndex: índice simple sobre productId (compensa el índice que
-- perdemos al borrar el único compuesto de abajo; varias consultas
-- públicas filtran/incluyen ofertas por producto).
CREATE INDEX `offers_productId_idx` ON `offers`(`productId`);

-- CreateIndex: apoya las consultas de desactivación de ofertas viejas
-- acotadas por fuente + comercio (ver deactivateStaleOffersForSource).
CREATE INDEX `offers_source_merchantId_idx` ON `offers`(`source`, `merchantId`);

-- DropIndex: la restricción única antigua por (producto, comercio) ya no
-- es correcta — impedía a propósito varias ofertas del mismo comercio para
-- el mismo producto, que ahora sí deben poder coexistir (p. ej. dos
-- listados de eBay del mismo producto con externalId distinto).
DROP INDEX `offers_productId_merchantId_key` ON `offers`;

-- CreateIndex: nueva identidad única y estable de una oferta: fuente +
-- comercio + id externo. MySQL trata cada NULL de `externalId` como
-- distinto entre sí, así que esta restricción no obliga a que las filas
-- del importador CSV histórico (externalId casi siempre ausente) sean
-- únicas por sí sola — ese caso se sigue resolviendo a nivel de aplicación
-- exactamente como antes (por producto + comercio), sin cambios de
-- comportamiento para el CSV.
CREATE UNIQUE INDEX `offers_source_merchantId_externalId_key` ON `offers`(`source`, `merchantId`, `externalId`);

-- CreateTable: configuración de cadencia por fuente de sincronización.
-- `enabled` empieza siempre en `false` y no se inserta ninguna fila todavía
-- desde esta migración: nada se activa solo por aplicar este cambio.
CREATE TABLE `sync_source_configs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `source` ENUM('CSV', 'AWIN', 'EBAY') NOT NULL,
    `intervalMinutes` INTEGER NOT NULL DEFAULT 1440,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `lastRunAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sync_source_configs_source_key`(`source`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
