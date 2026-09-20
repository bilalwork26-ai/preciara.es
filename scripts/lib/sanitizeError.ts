/**
 * Quita cualquier fragmento con forma de cadena de conexión (usuario y
 * contraseña incluidos) de un mensaje de error antes de imprimirlo. Algunos
 * errores de Prisma (sobre todo de inicialización) pueden incluir la URL de
 * conexión completa; estos scripts nunca deben volcarla en la terminal ni en
 * un log que pueda acabar compartido.
 */
export function sanitizeErrorMessage(message: string): string {
  return message.replace(/\b\w+:\/\/[^\s"']*/g, "[url-oculta]");
}
