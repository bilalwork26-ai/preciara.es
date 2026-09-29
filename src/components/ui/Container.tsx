import type { ReactNode } from "react";

export function Container({
  children,
  className,
  wide = false,
}: {
  children: ReactNode;
  className?: string;
  /**
   * true = sin límite de ancho (`max-w-none`) en vez de `max-w-7xl`
   * (1280px). Pensado para listados de catálogo (`/categoria/[slug]`,
   * `/buscar`) donde una rejilla de tarjetas de producto se beneficia de
   * usar todo el ancho disponible en monitores anchos — a diferencia de
   * texto editorial/de lectura, donde `max-w-7xl` sigue siendo el valor
   * por defecto a propósito (evita líneas demasiado largas).
   */
  wide?: boolean;
}) {
  return (
    <div className={`mx-auto w-full ${wide ? "max-w-none" : "max-w-7xl"} px-4 sm:px-6 lg:px-8 ${className ?? ""}`}>
      {children}
    </div>
  );
}
