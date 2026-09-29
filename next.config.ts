import type { NextConfig } from "next";
import { execSync } from "node:child_process";

/**
 * Commit exacto que se está compilando, capturado en tiempo de build (no
 * en tiempo de arranque del servidor): esto es lo que se expone luego en
 * la cabecera `x-build-commit` de cada respuesta (ver `headers()` más
 * abajo). Sirve para verificar desde fuera, con una simple petición HTTP,
 * qué commit está sirviendo de verdad el proceso Node.js en producción —
 * sin depender de inferirlo indirectamente por el comportamiento de la
 * página (orden de descuento, variantes colapsadas...), que es frágil y
 * lento de confirmar. Nace de un caso real: tras varios despliegues en
 * Hostinger reportados como correctos en el panel (build, migraciones y
 * reinicio sin errores), la web en producción seguía sirviendo el
 * comportamiento de un commit varias PRs más antiguo — sin esta cabecera,
 * cada comprobación dependía de examinar el HTML renderizado para
 * adivinar qué versión del código estaba realmente en marcha.
 *
 * `git rev-parse HEAD` funciona porque el build de Hostinger clona el
 * repositorio de verdad (con `.git`), no solo copia los ficheros — si
 * alguna vez el build corriera sin `.git` disponible (un tarball sin
 * historial, por ejemplo), cae a "unknown" en vez de romper el build.
 */
function resolveBuildCommit(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "unknown";
  }
}

const BUILD_COMMIT = resolveBuildCommit();

const nextConfig: NextConfig = {
  images: {
    // Calidad usada por las imágenes del hero (src="/images/hero-*.webp").
    qualities: [75, 82],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "x-build-commit", value: BUILD_COMMIT }],
      },
    ];
  },
};

export default nextConfig;
