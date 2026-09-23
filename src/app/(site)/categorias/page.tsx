import type { Metadata } from "next";
import * as icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getCategoriesIndex } from "@/server/dataSource/category";
import { Container } from "@/components/ui/Container";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Categorías",
  description: "Explora todas las categorías de productos con ofertas activas en Preciara.",
  alternates: { canonical: "/categorias" },
  openGraph: { title: "Categorías — Preciara", type: "website" },
};

export default async function CategoriesIndexPage() {
  const { categories, source } = await getCategoriesIndex();

  return (
    <Container className="py-10">
      <h1 className="font-serif text-2xl font-bold text-navy-900 sm:text-3xl">Todas las categorías</h1>
      <p className="mt-1 text-sm text-navy-500">
        {source === "demo"
          ? "Datos de demostración: aún no está conectado el catálogo real."
          : `${categories.length} categorías con ofertas activas.`}
      </p>

      <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {categories.map((category) => {
          const Icon = (icons as unknown as Record<string, LucideIcon>)[category.icon] ?? icons.Tag;
          return (
            <li key={category.slug}>
              <a
                href={`/categoria/${category.slug}`}
                className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-white p-4 text-center shadow-sm transition-colors hover:border-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
              >
                <Icon className="h-6 w-6 text-teal-600" aria-hidden="true" strokeWidth={1.75} />
                <span className="text-sm font-medium text-navy-900">{category.name}</span>
                <span className="text-xs text-navy-300">
                  {category.activeProductCount} {category.activeProductCount === 1 ? "producto" : "productos"}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </Container>
  );
}
