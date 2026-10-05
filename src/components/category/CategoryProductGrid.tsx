"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { Merchant, Product } from "@/types";
import { buildSubcategoryTabState, getSubcategoryTaxonomy, type ProductTypeSlug } from "@/lib/productType";
import { CategoryProductCard } from "./CategoryProductCard";

const TAB_FOCUS_CLASSES =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2";

/**
 * Mismo criterio de layout que el resto de listados de producto
 * (`/buscar`, `/supergangas`): rejilla fija de 2 columnas en móvil
 * (tarjeta en vertical), `flex-wrap` desde `sm:` para que la última fila
 * incompleta nunca deje huecos vacíos reservando ancho de columna.
 */
function ProductGridList({ children, ariaLabel }: { children: ReactNode; ariaLabel: string }) {
  return (
    <ul className="mt-6 grid grid-cols-2 gap-3 sm:flex sm:flex-row sm:flex-wrap sm:gap-4" aria-label={ariaLabel}>
      {children}
    </ul>
  );
}

function tabClassName(active: boolean): string {
  return `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${TAB_FOCUS_CLASSES} ${
    active ? "border-navy-900 bg-navy-900 text-white" : "border-border bg-white text-navy-700 hover:border-teal-600 hover:text-teal-700"
  }`;
}

function tabCountClassName(active: boolean): string {
  return `rounded-full px-1.5 text-xs ${active ? "bg-white/20" : "bg-beige text-navy-500"}`;
}

/** Mismo tamaño de página y mismo motivo que PAGE_SIZE en OfertasCatalog.tsx: desde que /categoria/[slug] sirve el catálogo completo (ver CATEGORY_PRODUCTS_LIMIT en category.ts), `products` puede ser mucho más grande que antes — paginación en cliente, sin ida y vuelta al servidor. */
const PAGE_SIZE = 24;

/**
 * Listado de productos de `/categoria/[slug]`, con pestañas de
 * subcategoría cuando la categoría las tiene definidas (moda, deporte,
 * hogar — ver `getSubcategoryTaxonomy` en `src/lib/productType.ts`).
 * Filtrado 100% en cliente e instantáneo (sin recargar la página ni
 * volver a pedir datos): la categoría entera ya llegó en `products`, así
 * que cambiar de pestaña es solo cambiar qué se muestra, nunca una nueva
 * consulta. Toda la lógica de clasificación/recuento/filtrado vive en
 * `buildSubcategoryTabState` (pura, probada aparte); este componente solo
 * la envuelve en estado y JSX.
 *
 * Categorías sin taxonomía definida (tecnología, electrodomésticos...)
 * muestran el listado plano de siempre, sin pestañas.
 */
export function CategoryProductGrid({
  products,
  merchants,
  categorySlug,
}: {
  products: Product[];
  merchants: Merchant[];
  categorySlug: string;
}) {
  const taxonomy = getSubcategoryTaxonomy(categorySlug);
  const [activeType, setActiveType] = useState<ProductTypeSlug | "todas">("todas");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Solo se recalcula si cambian products/taxonomy, nunca en cada cambio de pestaña.
  const tabState = useMemo(
    () => (taxonomy ? buildSubcategoryTabState(products, (product) => product.name, taxonomy) : null),
    [products, taxonomy]
  );

  const allVisibleProducts = taxonomy && tabState ? tabState.productsForTab(activeType) : products;

  // Mismo patrón que OfertasCatalog.tsx (ver ese fichero para el porqué):
  // ajustado en el cuerpo del render, nunca dentro de un efecto, para
  // volver siempre a la primera página en cuanto cambia la pestaña o el
  // propio `products` (p. ej. al navegar de una categoría a otra).
  const [appliedState, setAppliedState] = useState({ activeType, products });
  if (appliedState.activeType !== activeType || appliedState.products !== products) {
    setAppliedState({ activeType, products });
    setVisibleCount(PAGE_SIZE);
  }

  const visibleProducts = allVisibleProducts.slice(0, visibleCount);

  const grid = (ariaLabel: string) => (
    <>
      <ProductGridList ariaLabel={ariaLabel}>
        {visibleProducts.map((product) => (
          <li key={product.slug} className="sm:min-w-[240px] sm:max-w-[560px] sm:flex-1">
            <CategoryProductCard product={product} merchants={merchants} />
          </li>
        ))}
      </ProductGridList>
      {visibleCount < allVisibleProducts.length && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            className="rounded-full border border-teal-600 px-5 py-2 text-sm font-medium text-teal-700 transition-colors hover:bg-teal-50"
          >
            Mostrar más ({allVisibleProducts.length - visibleCount} más)
          </button>
        </div>
      )}
    </>
  );

  if (!taxonomy || !tabState) {
    return grid("Todos los productos de la categoría");
  }

  const activeLabel = activeType === "todas" ? "todas las subcategorías" : taxonomy.find((rule) => rule.slug === activeType)?.label;

  return (
    <div>
      <div role="tablist" aria-label="Filtrar por tipo de producto" className="flex flex-wrap gap-2">
        <button
          type="button"
          role="tab"
          aria-selected={activeType === "todas"}
          onClick={() => setActiveType("todas")}
          className={tabClassName(activeType === "todas")}
        >
          Todas
          <span className={tabCountClassName(activeType === "todas")}>{tabState.totalCount}</span>
        </button>
        {tabState.visibleRules.map((rule) => (
          <button
            key={rule.slug}
            type="button"
            role="tab"
            aria-selected={activeType === rule.slug}
            onClick={() => setActiveType(rule.slug)}
            className={tabClassName(activeType === rule.slug)}
          >
            {rule.label}
            <span className={tabCountClassName(activeType === rule.slug)}>{tabState.countByType.get(rule.slug)}</span>
          </button>
        ))}
      </div>

      {grid(`Productos: ${activeLabel}`)}
    </div>
  );
}
