#!/usr/bin/env -S npx tsx
/**
 * Paso de compilación (se ejecuta dentro de `npm run build`, antes de
 * `next build`): si hay `DATABASE_URL`, comprueba la conexión y aplica
 * SOLO las migraciones pendientes con `prisma migrate deploy`. Nunca usa
 * `prisma db push`, `migrate reset` ni `--force-reset`, nunca ejecuta el
 * seed, y nunca imprime la contraseña ni la cadena de conexión completa
 * (`sanitizeErrorMessage` las oculta de cualquier mensaje de error).
 *
 * Sin `DATABASE_URL`, no hace nada y el build continúa con el fallback de
 * demostración — este paso nunca es la razón de que un checkout sin base
 * de datos deje de compilar.
 *
 * Si la conexión o la migración fallan, termina con código de salida 1:
 * como forma parte de `npm run build` con `&&`, `next build` ni siquiera
 * llega a ejecutarse, así que Hostinger no publica nada nuevo y la versión
 * ya desplegada sigue sirviendo tal cual.
 *
 * Reutiliza `checkDatabaseConnection`/`isMigrationApplicable`
 * (scripts/lib/dbConnection.ts, también usado por `npm run db:check`) y
 * `sanitizeErrorMessage` (scripts/lib/sanitizeError.ts) para no duplicar
 * esa lógica.
 *
 * Textos exactos a buscar en los logs de compilación de Hostinger:
 * - "[db:migrate] Sin DATABASE_URL"                        -> no hay BD configurada; el build sigue con el fallback de demostración, nada que revisar.
 * - "[db:migrate] Conexión a MySQL verificada"              -> la conexión funciona.
 * - "[db:migrate] Migraciones aplicadas correctamente"      -> las migraciones se aplicaron sin problemas.
 * - "[db:migrate] ERROR: no se pudo conectar a la base de datos" -> fallo de conexión; la línea siguiente trae el motivo saneado (p. ej. host/usuario/contraseña incorrectos, o que "localhost" no es el host real en producción).
 * - "[db:migrate] ERROR: fallo al aplicar las migraciones"  -> `prisma migrate deploy` falló; revisa las líneas de Prisma justo arriba (no incluyen la contraseña) y el resumen saneado debajo.
 */
import { execFileSync } from "node:child_process";
import { checkDatabaseConnection, isMigrationApplicable } from "./lib/dbConnection";
import { sanitizeErrorMessage } from "./lib/sanitizeError";

function log(line: string): void {
  console.log(`[db:migrate] ${line}`);
}

function errorLine(line: string): void {
  console.error(`[db:migrate] ${line}`);
}

export async function runBuildMigration(): Promise<number> {
  if (!isMigrationApplicable()) {
    log("Sin DATABASE_URL: se omite la migración; el build continúa con el fallback de demostración.");
    return 0;
  }

  log("DATABASE_URL definida. Comprobando la conexión antes de migrar (sin escribir nada todavía)...");
  const connection = await checkDatabaseConnection();
  if (!connection.ok) {
    errorLine("ERROR: no se pudo conectar a la base de datos.");
    errorLine(connection.sanitizedMessage);
    errorLine(
      "El build se detiene aquí sin tocar nada: revisa host, puerto, usuario y contraseña de DATABASE_URL en las " +
        "variables de entorno de Hostinger (nunca en el repositorio). La versión publicada anteriormente sigue intacta."
    );
    return 1;
  }
  log(`Conexión a MySQL verificada (respuesta en ${connection.ms} ms).`);

  log("Aplicando únicamente migraciones pendientes con `prisma migrate deploy` (nunca db push, nunca migrate reset, nunca --force-reset)...");
  try {
    // `migrate deploy` es el comando de Prisma pensado para producción: solo
    // aplica migraciones ya commiteadas en prisma/migrations/, nunca genera
    // una nueva ni borra datos. `stdio: "inherit"` deja que Prisma imprima su
    // propio progreso (ya sanea el usuario/contraseña de la URL él mismo).
    execFileSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit" });
  } catch (error) {
    errorLine("ERROR: fallo al aplicar las migraciones.");
    errorLine(sanitizeErrorMessage(error instanceof Error ? error.message : String(error)));
    errorLine(
      "El build se detiene aquí sin haber ejecutado ninguna operación destructiva. La versión publicada " +
        "anteriormente sigue intacta. Revisa `npm run db:migrate:status` antes de reintentar."
    );
    return 1;
  }

  log("Migraciones aplicadas correctamente.");
  log('El seed NO se ejecuta automáticamente en el build (usa "npm run db:prepare -- --seed" a mano si quieres cargar datos de demostración).');
  return 0;
}

runBuildMigration()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    errorLine("ERROR inesperado durante la preparación de la base de datos.");
    errorLine(sanitizeErrorMessage(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
