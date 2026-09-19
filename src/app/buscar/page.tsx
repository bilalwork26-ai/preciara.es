import type { Metadata } from "next";
import { SearchX } from "lucide-react";
import { demoProducts } from "@/data/demo/products";
import { demoCategories } from "@/data/demo/categories";
import { demoMerchants } from "@/data/demo/merchants";
import { formatPrice } from "@/lib/format";
import { Container } from "@/components/ui/Container";
import { ProductGlyph } from "@/components/ui/ProductGlyph";
import { SearchForm } from "@/components/home/SearchForm";

export const metadata: Metadata = {
  title: "Resultados de búsqueda",
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export default async function BuscarPage({
  searchParams,
}: PageProps<"/buscar">) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const categoriaSlug = typeof params.categoria === "string" ? params.categoria : "";
  const categoria = demoCategories.find((c) => c.slug === categoriaSlug);

  const results = demoProducts.filter((product) => {
    const matchesQuery = query ? normalize(product.name).includes(normalize(query)) : true;
    const matchesCategory = categoria ? product.categoryId === categoria.id : true;
    return matchesQuery && matchesCategory;
  });

  return (
    <Container className="py-10">
      <h1 className="font-serif text-2xl font-semibold text-navy-900 sm:text-3xl">
        {categoria ? categoria.name : "Buscar productos"}
      </h1>
      <p className="mt-1 text-sm text-navy-500">
        {query ? (
          <>
            Resultados para <span className="font-medium text-navy-700">&ldquo;{query}&rdquo;</span>
          </>
        ) : (
          "Datos de demostración: aún no está conectado el catálogo real."
        )}
      </p>

      <div className="mt-6 max-w-xl">
        <SearchForm />
      </div>

      {results.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <SearchX className="h-8 w-8 text-navy-300" aria-hidden="true" strokeWidth={1.5} />
          <p className="text-navy-500">No hemos encontrado productos de demostración con ese criterio.</p>
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((product) => {
            const bestOffer = [...product.offers].sort((a, b) => a.price - b.price)[0];
            const merchant = demoMerchants.find((m) => m.id === bestOffer?.merchantId);
            return (
              <li
                key={product.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm"
              >
                <ProductGlyph icon={product.icon} className="h-14 w-14 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-navy-900">{product.name}</p>
                  {bestOffer && (
                    <>
                      <p className="mt-0.5 text-base font-semibold text-navy-900">
                        {formatPrice(bestOffer.price)}
                      </p>
                      <p className="text-xs text-navy-300">Mejor precio en {merchant?.name}</p>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Container>
  );
}
