-- AlterTable
ALTER TABLE `merchants` ADD COLUMN `isDemo` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `offers` ADD COLUMN `isDemo` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `products` ADD COLUMN `isDemo` BOOLEAN NOT NULL DEFAULT false;
