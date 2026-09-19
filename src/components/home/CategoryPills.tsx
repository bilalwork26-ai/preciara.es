import * as icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { demoCategories } from "@/data/demo/categories";

export function CategoryPills() {
  return (
    <ul
      className="no-scrollbar flex snap-x gap-2.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0"
      aria-label="Categorías"
    >
      {demoCategories.map((category) => {
        const Icon = (icons as unknown as Record<string, LucideIcon>)[category.icon] ?? icons.Tag;
        return (
          <li key={category.id} className="shrink-0 snap-start">
            <a
              href={`/buscar?categoria=${category.slug}`}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-border bg-white px-4 py-2.5 text-sm font-medium text-navy-700 shadow-sm transition-colors hover:border-teal-600 hover:text-teal-700"
            >
              <Icon className="h-4 w-4 text-teal-600" aria-hidden="true" strokeWidth={1.75} />
              {category.name}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
