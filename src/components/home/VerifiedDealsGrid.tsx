import Link from "next/link";
import { ArrowRight, Tags } from "lucide-react";
import { demoDealsGrid } from "@/data/demo/products";
import { ProductDealCard } from "./ProductDealCard";

export function VerifiedDealsGrid() {
  return (
    <section aria-labelledby="bajadas-heading">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="bajadas-heading" className="flex items-center gap-2 font-serif text-2xl font-bold text-navy-900">
            <Tags className="h-5 w-5 text-teal-600" aria-hidden="true" strokeWidth={1.75} />
            Bajadas verificadas hoy
          </h2>
          <p className="mt-1 text-sm text-navy-500">
            Productos con bajada de precio real, verificada y actualizada en el tiempo definido para cada tienda.
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
        {demoDealsGrid.map((product) => (
          <div key={product.id} className="w-[220px] shrink-0 snap-start sm:w-auto">
            <ProductDealCard product={product} />
          </div>
        ))}
      </div>
    </section>
  );
}
