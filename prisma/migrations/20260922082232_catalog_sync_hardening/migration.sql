-- Endurece el núcleo de sincronización de catálogos (Awin/eBay, todavía
-- sin conectar): sustituye GET_LOCK/RELEASE_LOCK por un bloqueo con lease
-- (tabla `sync_locks`, ver src/server/importer/distributedLock.ts) y añade
-- una columna nueva y propia para el GTIN normalizado con restricción
-- única a nivel de base de datos (`products.canonicalGtin`), para que dos
-- sincronizaciones concurrentes nunca puedan crear dos productos para el
-- mismo GTIN.
--
-- `canonicalGtin` es una columna NUEVA, separada de `ean` (el campo
-- histórico del importador CSV, que nunca se validó ni normalizó): así la
-- restricción única se aplica desde el primer momento sin arriesgarse a
-- que datos históricos de `ean` —no auditados aquí, y que no se tocan— ya
-- tuvieran duplicados o formatos distintos para el mismo código y
-- impidieran aplicar la migración. Ningún dato existente se modifica ni se
-- borra.

-- AlterTable
ALTER TABLE `products` ADD COLUMN `canonicalGtin` VARCHAR(14) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `products_canonicalGtin_key` ON `products`(`canonicalGtin`);

-- CreateTable
CREATE TABLE `sync_locks` (
    `name` VARCHAR(190) NOT NULL,
    `holderId` VARCHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `acquiredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sync_locks_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
