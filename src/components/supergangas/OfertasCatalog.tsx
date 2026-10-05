"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Merchant, Product } from "@/types";
import { ALL_FILTER_VALUE, availableCategoryOptions, availableMerchantOptions, filterOfertas } from "@/lib/ofertasFilters";
import { ProductDealCard } from "@/components/home/ProductDealCard";

/** Cuántas tarjetas se muestran de entrada (y cuántas más añade cada pulsación de "Mostrar más"): `products` puede llegar a ser el catálogo activo completo (ver OFERTAS_PAGE_POOL_SIZE en server/dataSource/home.ts), así que cargar todo de golpe en el DOM sería excesivo — paginación en cliente, sin ida y vuelta al servidor, ya que `products` llega completo desde la página. */
const PAGE_SIZE = 24;

/**
 * Catálogo completo de `/supergangas` con filtros por categoría y
 * tienda (lógica de filtrado en `src/lib/ofertasFilters.ts`, probada
 * aparte) — a diferencia del adelanto de la portada, esta página nunca
 * recorta el catálogo por un umbral de descuento MÍNIMO ni a un puñado de
 * tarjetas: `products` ya llega con TODAS las ofertas CON descuento real
 * del catálogo (nunca productos a su PVP normal, ver `getOfertasBundle`),
 * este componente solo decide cuánto enseña de golpe.
 */
export function OfertasCatalog({
  products,
  merchants,
  categoryNameById,
}: {
  products: Product[];
  merchants: Merchant[];
  categoryNameById: Record<string, string>;
}) {
  const [categoryId, setCategoryId] = useState(ALL_FILTER_VALUE);
  const [merchantId, setMerchantId] = useState(ALL_FILTER_VALUE);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // Para volver siempre a la primera página en cuanto cambia un filtro
  // (seguir en la página 3 de un filtro nuevo dejaría "Mostrar más" ya
  // agotado sin que se vea ni una tarjeta) sin el antipatrón de
  // "setState dentro de un efecto": se ajusta en el propio cuerpo del
  // render, el patrón que React recomienda para "resetear estado cuando
  // cambia una prop" (https://react.dev/learn/you-might-not-need-an-effect).
  const [appliedFilters, setAppliedFilters] = useState({ categoryId, merchantId, query });
  if (appliedFilters.categoryId !== categoryId || appliedFilters.merchantId !== merchantId || appliedFilters.query !== query) {
    setAppliedFilters({ categoryId, merchantId, query });
    setVisibleCount(PAGE_SIZE);
  }

  const categoryOptions = useMemo(() => availableCategoryOptions(products, categoryNameById), [products, categoryNameById]);
  const merchantOptions = useMemo(() => availableMerchantOptions(products, merchants), [products, merchants]);
  const filtered = useMemo(() => filterOfertas(products, { categoryId, merchantId, query }), [products, categoryId, merchantId, query]);
  const filtersActive = categoryId !== ALL_FILTER_VALUE || merchantId !== ALL_FILTER_VALUE || query.trim() !== "";

  const visible = filtered.slice(0, visibleCount);

  return (
    <div>
      <div className="mt-4 flex flex-wrap items-center gap-3" role="group" aria-label="Filtrar Supergangas">
        <label className="relative flex w-full items-center sm:w-64">
          <span className="sr-only">Buscar en Supergangas</span>
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-navy-300" aria-hidden="true" strokeWidth={1.75} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar: zapatillas, sudadera, batería..."
            className="w-full rounded-full border border-border bg-white py-1.5 pl-9 pr-3 text-sm text-navy-900 placeholder:text-navy-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-navy-700">
          Categoría
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="rounded-full border border-border bg-white px-3 py-1.5 text-sm text-navy-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
          >
            <option value={ALL_FILTER_VALUE}>Todas</option>
            {categoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-navy-700">
          Tienda
          <select
            value={merchantId}
            onChange={(event) => setMerchantId(event.target.value)}
            className="rounded-full border border-border bg-white px-3 py-1.5 text-sm text-navy-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
          >
            <option value={ALL_FILTER_VALUE}>Todas</option>
            {merchantOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/*
        Solo se muestra este recuento cuando dice algo que el párrafo
        estático de arriba (el del total sin filtrar, ver page.tsx) no
        dice ya: con filtros activos, o cuando la paginación en cliente
        está recortando la vista. Evita repetir casi el mismo texto dos
        veces en el caso más común (sin filtrar, todo visible).
      */}
      {(filtersActive || visibleCount < filtered.length || filtered.length === 0) && (
        <p className="mt-3 text-sm text-navy-500">
          {filtered.length === 0
            ? "Ningún producto cumple estos filtros ahora mismo."
            : `Mostrando ${Math.min(visibleCount, filtered.length)} de ${filtered.length} ${filtered.length === 1 ? "producto" : "productos"}.`}
        </p>
      )}

      {filtered.length > 0 && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:flex sm:flex-row sm:flex-wrap sm:gap-4" aria-label="Resultado filtrado de Supergangas">
            {visible.map((product, index) => (
              <div key={product.id} className="sm:min-w-[220px] sm:max-w-[380px] sm:flex-1">
                <ProductDealCard product={product} merchants={merchants} highlight={index === 0 && !filtersActive} />
              </div>
            ))}
          </div>

          {visibleCount < filtered.length && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                className="rounded-full border border-teal-600 px-5 py-2 text-sm font-medium text-teal-700 transition-colors hover:bg-teal-50"
              >
                Mostrar más ({filtered.length - visibleCount} más)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
