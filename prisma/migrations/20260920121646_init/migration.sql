-- CreateTable
CREATE TABLE `categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(120) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `categories_slug_key`(`slug`),
    INDEX `categories_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(160) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `brand` VARCHAR(100) NULL,
    `model` VARCHAR(100) NULL,
    `ean` VARCHAR(32) NULL,
    `imageUrl` VARCHAR(500) NULL,
    `categoryId` INTEGER NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `products_slug_key`(`slug`),
    INDEX `products_categoryId_idx`(`categoryId`),
    INDEX `products_isActive_idx`(`isActive`),
    INDEX `products_categoryId_isActive_idx`(`categoryId`, `isActive`),
    INDEX `products_ean_idx`(`ean`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `merchants` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(120) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `websiteUrl` VARCHAR(500) NOT NULL,
    `logoUrl` VARCHAR(500) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `merchants_slug_key`(`slug`),
    INDEX `merchants_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `offers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productId` INTEGER NOT NULL,
    `merchantId` INTEGER NOT NULL,
    `externalId` VARCHAR(120) NULL,
    `currentPrice` DECIMAL(10, 2) NOT NULL,
    `previousPrice` DECIMAL(10, 2) NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'EUR',
    `productUrl` VARCHAR(700) NOT NULL,
    `affiliateUrl` VARCHAR(700) NULL,
    `availability` ENUM('IN_STOCK', 'OUT_OF_STOCK', 'PREORDER', 'DISCONTINUED', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `shippingCost` DECIMAL(10, 2) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastCheckedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `offers_merchantId_idx`(`merchantId`),
    INDEX `offers_isActive_idx`(`isActive`),
    INDEX `offers_lastCheckedAt_idx`(`lastCheckedAt`),
    INDEX `offers_availability_idx`(`availability`),
    UNIQUE INDEX `offers_productId_merchantId_key`(`productId`, `merchantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `price_snapshots` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `offerId` INTEGER NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `shippingCost` DECIMAL(10, 2) NULL,
    `availability` ENUM('IN_STOCK', 'OUT_OF_STOCK', 'PREORDER', 'DISCONTINUED', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `recordedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `price_snapshots_offerId_recordedAt_idx`(`offerId`, `recordedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `import_runs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `source` VARCHAR(160) NOT NULL,
    `status` ENUM('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED') NOT NULL DEFAULT 'RUNNING',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `rowsRead` INTEGER NOT NULL DEFAULT 0,
    `productsCreated` INTEGER NOT NULL DEFAULT 0,
    `productsUpdated` INTEGER NOT NULL DEFAULT 0,
    `offersCreated` INTEGER NOT NULL DEFAULT 0,
    `offersUpdated` INTEGER NOT NULL DEFAULT 0,
    `rowsRejected` INTEGER NOT NULL DEFAULT 0,
    `errorSummary` VARCHAR(500) NULL,
    `metadata` JSON NULL,

    INDEX `import_runs_status_idx`(`status`),
    INDEX `import_runs_startedAt_idx`(`startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `import_errors` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `importRunId` INTEGER NOT NULL,
    `rowNumber` INTEGER NULL,
    `errorCode` VARCHAR(60) NOT NULL,
    `message` VARCHAR(500) NOT NULL,
    `rowData` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `import_errors_importRunId_idx`(`importRunId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `offers` ADD CONSTRAINT `offers_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `offers` ADD CONSTRAINT `offers_merchantId_fkey` FOREIGN KEY (`merchantId`) REFERENCES `merchants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `price_snapshots` ADD CONSTRAINT `price_snapshots_offerId_fkey` FOREIGN KEY (`offerId`) REFERENCES `offers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `import_errors` ADD CONSTRAINT `import_errors_importRunId_fkey` FOREIGN KEY (`importRunId`) REFERENCES `import_runs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
