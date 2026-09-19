import * as icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { demoCategories } from "@/data/demo/categories";

export function CategoryRow() {
  return (
    <ul
      className="no-scrollbar flex snap-x gap-2.5 overflow-x-auto pb-1"
      aria-label="Categorías"
      tabIndex={0}
    >
      {demoCategories.map((category, index) => {
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
  );
}
