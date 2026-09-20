"use client";

import { useEffect, useRef, useState } from "react";
import * as icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Category } from "@/types";

export function CategoryRow({ categories }: { categories: Category[] }) {
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
        {categories.map((category, index) => {
          const Icon = (icons as unknown as Record<string, LucideIcon>)[category.icon] ?? icons.Tag;
          const isDefaultActive = index === 0;
          return (
            <li key={category.id} className="shrink-0 snap-start">
              <a
                href={`/buscar?categoria=${category.slug}`}
                aria-current={isDefaultActive ? "true" : undefined}
                className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2.5 text-sm font-medium shadow-sm transition-colors ${
                  isDefaultActive
                    ? "border-navy-900 bg-navy-900 text-white"
                    : "border-border bg-white text-navy-700 hover:border-teal-600 hover:text-teal-700"
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${isDefaultActive ? "text-crystal" : "text-teal-600"}`}
                  aria-hidden="true"
                  strokeWidth={1.75}
                />
                {category.name}
              </a>
            </li>
          );
        })}
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
            className="absolute left-0 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-white text-navy-700 shadow-sm hover:text-teal-600 sm:flex"
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
            className="absolute right-0 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-white text-navy-700 shadow-sm hover:text-teal-600 sm:flex"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}
