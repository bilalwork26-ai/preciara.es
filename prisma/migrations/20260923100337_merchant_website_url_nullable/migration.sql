-- Permite `merchants.websiteUrl` NULL: el adaptador de Awin (bloque
-- "orquestador automático", ver src/server/catalogSync/awinOrchestrator.ts)
-- deriva el comercio únicamente de metadatos de la lista de feeds
-- (advertiserId/advertiserName) y de las columnas del feed de productos —
-- ninguna de las dos fuentes aporta jamás la web de la tienda (solo enlaces
-- a productos concretos, nunca a la portada del comercio), así que
-- inventar un valor sería un dato falso presentado como real. `logoUrl` ya
-- era nulo por el mismo motivo (ver esquema); esta migración alinea
-- `websiteUrl` con ese mismo patrón. El importador CSV histórico sigue
-- exigiendo y aportando siempre un valor real — no se toca.
--
-- No destructiva: ningún dato existente se modifica ni se borra, solo se
-- relaja la restricción NOT NULL de la columna.

-- AlterTable
ALTER TABLE `merchants` MODIFY `websiteUrl` VARCHAR(500) NULL;
