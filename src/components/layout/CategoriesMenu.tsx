"use client";

import { useEffect, useRef, useState } from "react";
import * as icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, Menu } from "lucide-react";
import { demoCategories } from "@/data/demo/categories";

export function CategoriesMenu({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-ivory transition-colors hover:bg-white/10"
      >
        <Menu className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
        Categorías
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Categorías"
          className="absolute left-0 top-[calc(100%+8px)] z-50 w-72 rounded-2xl border border-border bg-white p-2 text-navy-900 shadow-lg"
        >
          <ul className="grid grid-cols-2 gap-1">
            {demoCategories.map((category) => {
              const Icon = (icons as unknown as Record<string, LucideIcon>)[category.icon] ?? icons.Tag;
              return (
                <li key={category.id}>
                  <a
                    href={`/buscar?categoria=${category.slug}`}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-navy-700 transition-colors hover:bg-beige hover:text-teal-700"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" strokeWidth={1.75} />
                    <span className="truncate">{category.name}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
