-- Migración de datos (no de esquema): corrige productos, comercios y
-- ofertas que se importaron desde examples/ofertas-ejemplo.csv antes de
-- que el importador exigiera declarar `is_demo` explícitamente (ver
-- README, "Formato CSV"). Ese fichero es enteramente ficticio -- marca
-- "MarcaFicticia", dominios "*.example.invalid", comercios "Tienda
-- Ejemplo Uno/Dos/Tres" -- y nunca debió quedar marcado como catálogo
-- real (`isDemo = false`).
--
-- Identifica cada fila SOLO por varias señales inequívocas del propio
-- fichero de ejemplo combinadas a la vez (slug conocido + marca/dominio),
-- nunca por una coincidencia parcial, para no tocar ningún dato real por
-- error. Es idempotente y segura de repetir: si ya están marcados como
-- demo, o si esos productos/comercios no existen en este entorno (un
-- checkout limpio, o una base que nunca importó ese fichero de ejemplo),
-- no cambia nada. No borra ninguna fila ni ninguna ejecución de
-- importación: el historial de `ImportRun`/`ImportError` queda intacto.

UPDATE `merchants`
SET `isDemo` = true
WHERE `slug` IN ('tienda-ejemplo-uno', 'tienda-ejemplo-dos', 'tienda-ejemplo-tres')
  AND `websiteUrl` LIKE '%.example.invalid%';

UPDATE `products`
SET `isDemo` = true
WHERE `slug` IN ('altavoz-portatil-xz1', 'cafetera-goteo-c200')
  AND `brand` = 'MarcaFicticia';

UPDATE `offers`
INNER JOIN `products` ON `products`.`id` = `offers`.`productId`
INNER JOIN `merchants` ON `merchants`.`id` = `offers`.`merchantId`
SET `offers`.`isDemo` = true
WHERE `products`.`slug` IN ('altavoz-portatil-xz1', 'cafetera-goteo-c200')
  AND `products`.`brand` = 'MarcaFicticia'
  AND `merchants`.`slug` IN ('tienda-ejemplo-uno', 'tienda-ejemplo-dos', 'tienda-ejemplo-tres')
  AND `merchants`.`websiteUrl` LIKE '%.example.invalid%';
