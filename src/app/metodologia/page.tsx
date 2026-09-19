import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Metodología",
  description: "Cómo obtiene, verifica y actualiza Preciara los precios que muestra.",
};

export default function MetodologiaPage() {
  return (
    <LegalPage title="Metodología" updated="Fase 1 — versión de demostración">
      <p>
        Preciara compara precios de productos entre distintas tiendas
        españolas para ayudarte a decidir cuándo y dónde comprar. Esta
        página explica, de forma sencilla, de dónde vienen los datos y cómo
        decidimos qué mostrar como &ldquo;verificado&rdquo;.
      </p>

      <section>
        <h2 className="font-serif text-lg font-semibold text-navy-900">Origen de los datos</h2>
        <p className="mt-2">
          Solo usamos fuentes autorizadas, por este orden de prioridad:
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>APIs oficiales de tiendas o de sus programas de afiliación.</li>
          <li>Feeds de productos proporcionados por redes de afiliación.</li>
          <li>Otras fuentes expresamente autorizadas por la tienda correspondiente.</li>
        </ol>
        <p className="mt-2">
          Preciara no extrae datos de ninguna tienda mediante scraping sin
          confirmar antes que está permitido por sus condiciones de uso.
        </p>
      </section>

      <section>
        <h2 className="font-serif text-lg font-semibold text-navy-900">Qué significa &ldquo;verificado&rdquo;</h2>
        <p className="mt-2">
          Un precio se marca como verificado solo cuando se ha comprobado
          dentro del periodo de frescura definido para esa tienda. Si una
          oferta deja de comprobarse durante ese periodo, se oculta o se
          marca como desactualizada: nunca mostramos como verificado un
          precio que no hemos podido confirmar.
        </p>
      </section>

      <section>
        <h2 className="font-serif text-lg font-semibold text-navy-900">Bajadas de precio reales</h2>
        <p className="mt-2">
          Una bajada se calcula comparando el precio verificado actual con
          el historial de precios guardado del mismo producto en la misma
          tienda, no con precios de referencia inventados por el fabricante.
        </p>
      </section>

      <section>
        <h2 className="font-serif text-lg font-semibold text-navy-900">Datos de demostración</h2>
        <p className="mt-2">
          Esta primera versión del sitio usa productos, precios e
          historiales de ejemplo, claramente separados del sistema que
          usaremos con datos reales. Se sustituirán en próximas fases, sin
          cambiar el funcionamiento descrito aquí.
        </p>
      </section>
    </LegalPage>
  );
}
