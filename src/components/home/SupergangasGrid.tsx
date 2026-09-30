import Link from "next/link";
import { ArrowRight, Flame } from "lucide-react";
import type { Merchant, Product } from "@/types";
import { OFERTAS_HREF } from "./categoryLinks";
import { ProductDealCard } from "./ProductDealCard";

/**
 * Sustituye a la antigua "Bajadas destacadas" (`VerifiedDealsGrid`,
 * retirada) por petición explícita: nunca conviven ambos bloques a la
 * vez. Los productos ya llegan filtrados y ordenados por
 * `getSupergangasBundle` (≥30% de descuento real, mayor descuento
 * primero, como mucho 6) — este componente solo pinta lo que recibe, sin
 * volver a filtrar ni reordenar nada.
 */
export function SupergangasGrid({
  products,
  merchants,
  source,
}: {
  products: Product[];
  merchants: Merchant[];
  /** De dónde vienen `products`/`merchants` (ver `SourcedResult` en `src/server/dataSource/withFallback.ts`): controla si se muestra la etiqueta "Datos demo", nunca se etiqueta catálogo real como demostración. */
  source: "database" | "demo";
}) {
  return (
    <section aria-labelledby="supergangas-heading">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="supergangas-heading" className="flex flex-wrap items-center gap-2 font-serif text-2xl font-bold text-navy-900">
            <Flame className="h-5 w-5 text-teal-600" aria-hidden="true" strokeWidth={1.75} />
            Supergangas
            {source === "demo" && (
              <span className="rounded-full bg-beige px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-navy-500">
                Datos demo
              </span>
            )}
          </h2>
          <p className="mt-1 text-sm text-navy-500">
            {source === "demo"
              ? "Ejemplo de chollos con descuentos superiores al 30%, con productos de demostración."
              : products.length > 0
                ? "Los descuentos más agresivos de nuestro catálogo real ahora mismo: al menos un 30%, verificados hoy."
                : "Ahora mismo no hay ningún producto de nuestro catálogo real con un descuento de al menos un 30%. Vuelve pronto."}
          </p>
        </div>
        {products.length > 0 && (
          <Link
            href={OFERTAS_HREF}
            className="hidden shrink-0 items-center gap-1 text-sm font-medium text-teal-600 hover:text-teal-700 sm:inline-flex"
          >
            Ver todas las Supergangas
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>

      {/*
        Mismo criterio de layout que la antigua "Bajadas destacadas" (ver
        historial de este fichero): rejilla fija de 2 columnas en móvil,
        `flex-wrap` a partir de `sm:` para que la última fila incompleta
        (aquí, casi siempre — el bloque tiene como mucho 6 tarjetas) nunca
        deje huecos vacíos reservando ancho de columna.

        Con catálogo real pero 0 chollos que superen el umbral (nunca con
        demo: demoSupergangas siempre tiene productos), no se pinta una
        rejilla vacía: el mensaje de arriba ya lo cuenta, así que aquí no
        hace falta nada más.
      */}
      {products.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-4" aria-label="Productos con descuento de al menos un 30%">
          {products.map((product, index) => (
            <div key={product.id} className="sm:min-w-[220px] sm:max-w-[380px] sm:flex-1">
              <ProductDealCard product={product} merchants={merchants} highlight={index === 0} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
