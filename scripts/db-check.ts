#!/usr/bin/env -S npx tsx
/**
 * Comprobación de conexión segura para preparar Hostinger (o cualquier
 * entorno nuevo): confirma que `DATABASE_URL` está definida y que el motor
 * responde, sin escribir nada en la base de datos y sin imprimir nunca la
 * cadena de conexión ni la contraseña.
 *
 * Uso: npm run db:check
 * Códigos de salida: 0 = conecta correctamente. 1 = no conecta o no está
 * configurada (mensaje explicativo, nunca la URL ni la contraseña).
 */
import { PrismaClient } from "../src/generated/prisma";
import { sanitizeErrorMessage } from "./lib/sanitizeError";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL no está definida: la web seguirá sirviendo datos de demostración.");
    console.log('Define DATABASE_URL (formato "mysql://usuario:contrasena@host:puerto/base") y repite esta comprobación.');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient({ log: ["error"] });
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const ms = Date.now() - start;
    console.log(`Conexión correcta a MySQL (respuesta en ${ms} ms).`);

    try {
      const [categories, merchants, products, offers] = await Promise.all([
        prisma.category.count(),
        prisma.merchant.count(),
        prisma.product.count(),
        prisma.offer.count(),
      ]);
      console.log(`Tablas accesibles — categorías: ${categories}, comercios: ${merchants}, productos: ${products}, ofertas: ${offers}.`);
      console.log("Todo listo. Si vas a activar la base por primera vez, ejecuta `npm run db:prepare`.");
    } catch {
      console.log("La base conecta pero todavía no tiene las tablas de Preciara (normal antes de migrar).");
      console.log("Ejecuta `npm run db:prepare` para aplicar las migraciones.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("No se pudo conectar o consultar la base de datos:");
    console.error(sanitizeErrorMessage(message));
    console.error("Revisa host, puerto, usuario, contraseña y que la base exista, pero nunca compartas la URL completa.");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
