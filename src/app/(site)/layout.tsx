import type { ReactNode } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

/**
 * Cabecera y pie de página públicos. Vive en este grupo de rutas (no en el
 * layout raíz) para que /admin no herede la cabecera de marketing ni el
 * footer legal: el panel técnico tiene su propio layout independiente.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      {/*
        Nunca `flex-1`: el body raíz es `flex flex-col min-h-full` (ver
        src/app/layout.tsx), así que un `<main>` con `flex-1` se estira para
        rellenar el alto del viewport en cualquier página más corta que la
        pantalla — ese relleno blanco caía precisamente entre el marquee de
        la portada (el último elemento real dentro de `<main>`) y este
        `<Footer>`, rompiendo el bloque azul continuo que ambos deben
        formar. Sin `flex-1`, `<main>` ocupa solo su alto real y el footer
        le sigue de inmediato, sin ningún hueco.
      */}
      <main>{children}</main>
      <Footer />
    </>
  );
}
