import Link from "next/link";
import { ArrowRight, Tags } from "lucide-react";
import type { Merchant, Product } from "@/types";
import { ProductDealCard } from "./ProductDealCard";

export function VerifiedDealsGrid({
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
    <section aria-labelledby="bajadas-heading">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="bajadas-heading" className="flex flex-wrap items-center gap-2 font-serif text-2xl font-bold text-navy-900">
            <Tags className="h-5 w-5 text-teal-600" aria-hidden="true" strokeWidth={1.75} />
            Bajadas destacadas
            {source === "demo" && (
              <span className="rounded-full bg-beige px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-navy-500">
                Datos demo
              </span>
            )}
          </h2>
          <p className="mt-1 text-sm text-navy-500">
            {source === "demo"
              ? "Ejemplo de comparación e historial con productos de demostración."
              : "Las mejores bajadas de precio de nuestro catálogo real, verificadas hoy."}
          </p>
        </div>
        <Link
          href="/buscar"
          className="hidden shrink-0 items-center gap-1 text-sm font-medium text-teal-600 hover:text-teal-700 sm:inline-flex"
        >
          Ver historial
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div
        className="no-scrollbar mt-5 flex snap-x gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible xl:grid-cols-3"
        aria-label="Productos con bajada de precio hoy"
        tabIndex={0}
      >
        {products.map((product, index) => (
          <div key={product.id} className="w-[220px] shrink-0 snap-start sm:w-auto">
            <ProductDealCard product={product} merchants={merchants} highlight={index === 0} />
          </div>
        ))}
      </div>
    </section>
  );
}
