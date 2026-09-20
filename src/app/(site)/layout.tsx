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
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
