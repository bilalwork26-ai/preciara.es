/** true si el enlace es una URL externa absoluta (para decidir target/rel al renderizarlo). Sin dependencias: seguro de importar desde componentes "use client". */
export function isExternalHref(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}
