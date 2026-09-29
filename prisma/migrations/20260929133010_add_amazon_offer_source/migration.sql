-- AlterTable
ALTER TABLE `offers` MODIFY `source` ENUM('CSV', 'AWIN', 'EBAY', 'AMAZON') NOT NULL DEFAULT 'CSV';

-- AlterTable
ALTER TABLE `products` MODIFY `metadataSource` ENUM('CSV', 'AWIN', 'EBAY', 'AMAZON') NULL;

-- AlterTable
ALTER TABLE `sync_source_configs` MODIFY `source` ENUM('CSV', 'AWIN', 'EBAY', 'AMAZON') NOT NULL;
