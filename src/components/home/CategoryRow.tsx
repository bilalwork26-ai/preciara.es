"use client";

import { useEffect, useRef, useState } from "react";
import * as icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react";
import { CATEGORIES_INDEX_HREF, OFERTAS_HREF, PRIMARY_NAV_ITEMS } from "./categoryLinks";

const PILL_FOCUS_CLASSES =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2";

/**
 * Navegación principal fija (`PRIMARY_NAV_ITEMS`, ver categoryLinks.ts):
 * antes recibía las categorías por props, generadas dinámicamente a
 * partir de las que tenían ofertas activas en BD — con un catálogo real
 * todavía pequeño, eso podía dejar solo 2-3 píldoras desalineadas con un
 * hueco vacío al lado (caso real reportado: "Moda, Otros, Infantil").
 * Sin props: siempre los mismos 5 elementos + "Ver todas", nunca depende
 * del inventario del momento.
 */
export function CategoryRow() {
  const scrollerRef = useRef<HTMLUListElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateScrollState();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      resizeObserver.disconnect();
    };
  }, []);

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <ul
        ref={scrollerRef}
        className="no-scrollbar flex snap-x justify-start gap-2.5 overflow-x-auto scroll-smooth pb-1 sm:justify-center"
        aria-label="Categorías principales"
        tabIndex={0}
      >
        {PRIMARY_NAV_ITEMS.map((item) => {
          const Icon = (icons as unknown as Record<string, LucideIcon>)[item.icon] ?? icons.Tag;
          // "Supergangas" no es una categoría más: se destaca en coral
          // (mismo acento que DiscountBadge/ProductDealCard) para que la
          // navegación deje claro, de un vistazo, que es el atajo a los
          // chollos, no una categoría de producto.
          const isDeals = item.href === OFERTAS_HREF;
          return (
            <li key={item.href} className="shrink-0 snap-start">
              <a
                href={item.href}
                aria-label={isDeals ? "Ver Supergangas: chollos con descuento real" : `Ver ofertas en ${item.label}`}
                className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2.5 text-sm font-medium shadow-sm transition-colors ${PILL_FOCUS_CLASSES} ${
                  isDeals
                    ? "border-coral-500 bg-coral-500 text-white hover:bg-coral-600"
                    : "border-border bg-white text-navy-700 hover:border-teal-600 hover:text-teal-700"
                }`}
              >
                <Icon className={`h-4 w-4 ${isDeals ? "text-white" : "text-teal-600"}`} aria-hidden="true" strokeWidth={1.75} />
                {item.label}
              </a>
            </li>
          );
        })}

        <li className="shrink-0 snap-start">
          <a
            href={CATEGORIES_INDEX_HREF}
            aria-label="Ver todas las categorías"
            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-dashed border-navy-300 bg-white px-4 py-2.5 text-sm font-medium text-navy-700 shadow-sm transition-colors hover:border-teal-600 hover:text-teal-700 ${PILL_FOCUS_CLASSES}`}
          >
            <LayoutGrid className="h-4 w-4 text-teal-600" aria-hidden="true" strokeWidth={1.75} />
            Ver todas
          </a>
        </li>
      </ul>

      {canScrollLeft && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 hidden w-10 bg-gradient-to-r from-white to-transparent sm:block"
          />
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            aria-label="Ver categorías anteriores"
            className={`absolute left-0 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-white text-navy-700 shadow-sm hover:text-teal-600 sm:flex ${PILL_FOCUS_CLASSES}`}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        </>
      )}

      {canScrollRight && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 hidden w-10 bg-gradient-to-l from-white to-transparent sm:block"
          />
          <button
            type="button"
            onClick={() => scrollBy(1)}
            aria-label="Ver más categorías"
            className={`absolute right-0 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-white text-navy-700 shadow-sm hover:text-teal-600 sm:flex ${PILL_FOCUS_CLASSES}`}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}
