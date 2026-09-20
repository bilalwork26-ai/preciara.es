import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Aviso de afiliación",
  description: "Cómo se financia Preciara y cómo afecta a las ofertas que muestra.",
};

export default function AvisoAfiliacionPage() {
  return (
    <LegalPage title="Aviso de afiliación" updated="Fase 1 — versión de demostración">
      <p>
        Preciara es un comparador de precios independiente. Para poder
        mantener el servicio, algunos enlaces hacia tiendas son enlaces de
        afiliado.
      </p>

      <section>
        <h2 className="font-serif text-lg font-semibold text-navy-900">¿Qué significa esto para ti?</h2>
        <p className="mt-2">
          Si haces clic en uno de estos enlaces y compras en la tienda de
          destino, Preciara puede recibir una pequeña comisión del
          programa de afiliación correspondiente. Esto no supone ningún
          coste adicional para ti: pagas exactamente el mismo precio que si
          hubieras entrado directamente en la tienda.
        </p>
      </section>

      <section>
        <h2 className="font-serif text-lg font-semibold text-navy-900">Independencia de los precios mostrados</h2>
        <p className="mt-2">
          Recibir o no una comisión de una tienda no influye en qué ofertas
          mostramos, en qué orden aparecen ni en si se marcan como
          &ldquo;verificadas&rdquo;. Ese criterio se explica en nuestra{" "}
          <a href="/metodologia" className="underline decoration-navy-300 underline-offset-2 hover:text-teal-600">
            página de metodología
          </a>
          .
        </p>
      </section>

      <section>
        <h2 className="font-serif text-lg font-semibold text-navy-900">Versión de demostración</h2>
        <p className="mt-2">
          En esta primera fase, los enlaces de tienda del sitio son de
          demostración y no dirigen a comisiones reales. Este aviso se
          aplicará en cuanto se activen integraciones de afiliación reales.
        </p>
      </section>
    </LegalPage>
  );
}
