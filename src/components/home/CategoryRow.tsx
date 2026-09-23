"use client";

import { useEffect, useRef, useState } from "react";
import * as icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react";
import type { Category } from "@/types";
import { buildCategoryHref } from "./categoryLinks";

const PILL_FOCUS_CLASSES =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2";

export function CategoryRow({ categories, viewAllHref }: { categories: Category[]; viewAllHref?: string }) {
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
        className="no-scrollbar flex snap-x gap-2.5 overflow-x-auto scroll-smooth pb-1"
        aria-label="Categorías"
        tabIndex={0}
      >
        {categories.map((category) => {
          const Icon = (icons as unknown as Record<string, LucideIcon>)[category.icon] ?? icons.Tag;
          return (
            <li key={category.id} className="shrink-0 snap-start">
              <a
                href={buildCategoryHref(category.slug)}
                aria-label={`Ver ofertas en ${category.name}`}
                className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-border bg-white px-4 py-2.5 text-sm font-medium text-navy-700 shadow-sm transition-colors hover:border-teal-600 hover:text-teal-700 ${PILL_FOCUS_CLASSES}`}
              >
                <Icon className="h-4 w-4 text-teal-600" aria-hidden="true" strokeWidth={1.75} />
                {category.name}
              </a>
            </li>
          );
        })}

        {viewAllHref && (
          <li className="shrink-0 snap-start">
            <a
              href={viewAllHref}
              aria-label="Ver todas las categorías"
              className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-dashed border-navy-300 bg-white px-4 py-2.5 text-sm font-medium text-navy-700 shadow-sm transition-colors hover:border-teal-600 hover:text-teal-700 ${PILL_FOCUS_CLASSES}`}
            >
              <LayoutGrid className="h-4 w-4 text-teal-600" aria-hidden="true" strokeWidth={1.75} />
              Ver todas
            </a>
          </li>
        )}
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
