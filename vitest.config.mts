import { defineConfig } from "vitest/config";
import path from "node:path";

// Carga .env si existe (desarrollo local): las pruebas de integración que
// necesitan una base de datos real se omiten automáticamente cuando no hay
// DATABASE_URL (p. ej. en un checkout limpio sin BD configurada).
try {
  process.loadEnvFile(path.resolve(import.meta.dirname, ".env"));
} catch {
  // Sin .env: normal en CI o en un checkout sin base de datos local.
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "prisma/**/*.test.ts", "scripts/**/*.test.ts"],
    // Varios ficheros de prueba aíslan "sin DATABASE_URL" apartando
    // físicamente el .env del disco (Prisma lo recarga al importarse) y
    // devolviéndolo al terminar. Con los ficheros en paralelo, dos workers
    // podrían mover/restaurar el mismo fichero a la vez y perderlo de
    // verdad: se desactiva el paralelismo entre ficheros para que esa
    // operación sea siempre segura.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
