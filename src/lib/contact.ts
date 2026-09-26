/**
 * Lectura segura del correo de contacto público (`/contacto`). Sigue el
 * mismo patrón que `src/server/ebay/config.ts`: nunca lanza por
 * configuración ausente o inválida, siempre devuelve `null` en ese caso,
 * para que quien llama decida qué mostrar (nunca un enlace `mailto:` roto
 * ni un correo inventado).
 *
 * `NEXT_PUBLIC_CONTACT_EMAIL` es una variable de cliente (visible en el
 * bundle, como `NEXT_PUBLIC_SITE_URL`): un correo de contacto público no es
 * un secreto, así que esto es intencional, no un descuido.
 */

// Formato básico de correo — suficiente para rechazar valores claramente
// inválidos (vacíos, sin arroba, con espacios) sin la complejidad de una
// validación RFC 5322 completa, que no hace falta aquí.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function getContactEmail(): string | null {
  const raw = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!EMAIL_PATTERN.test(trimmed)) return null;

  return trimmed;
}
