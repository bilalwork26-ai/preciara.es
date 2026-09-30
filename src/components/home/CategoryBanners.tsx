import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buildCategoryHref } from "./categoryLinks";

/**
 * Tres banners visuales grandes en portada, uno por agrupación de
 * categoría. Las etiquetas ("Moda y Deporte", "Hogar y Jardín") agrupan
 * DOS categorías reales de la taxonomía en un único banner con fines
 * puramente visuales/de marketing — Preciara no tiene una página que
 * filtre por más de una categoría a la vez, así que cada banner enlaza a
 * la categoría real más representativa de las dos que nombra (nunca a
 * `/buscar?categoria=...`, excluida de robots.txt — ver categoryLinks.ts):
 *   - "Moda y Deporte" → moda (la palabra encabeza la etiqueta).
 *   - "Electrónica" → tecnologia: no existe un slug "electronica" en la
 *     taxonomía (ver categories.ts); "tecnologia" es la categoría real
 *     más cercana.
 *   - "Hogar y Jardín" → hogar (la palabra encabeza la etiqueta;
 *     "jardin-bricolaje" es una categoría real distinta y más pequeña).
 * Las URLs de imagen son las exactas facilitadas para evitar imágenes rotas.
 */
const CATEGORY_BANNERS = [
  {
    slug: "moda",
    label: "Moda y Deporte",
    imageUrl: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=800&q=80",
  },
  {
    slug: "tecnologia",
    label: "Electrónica",
    imageUrl: "https://images.unsplash.com/photo-1498049794561-7780e7231661?w=800&q=80",
  },
  {
    slug: "hogar",
    label: "Hogar y Jardín",
    imageUrl: "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=800&q=80",
  },
] as const;

export function CategoryBanners() {
  return (
    <section aria-labelledby="category-banners-heading">
      <h2 id="category-banners-heading" className="sr-only">
        Categorías destacadas
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {CATEGORY_BANNERS.map((banner) => (
          <Link
            key={banner.slug}
            href={buildCategoryHref(banner.slug)}
            className="group relative block h-40 overflow-hidden rounded-2xl bg-navy-900 sm:h-52"
          >
            {/* alt="": la imagen es puramente decorativa, el nombre de la categoría ya está en texto real justo debajo (nunca solo dentro de la foto). */}
            <Image
              src={banner.imageUrl}
              alt=""
              fill
              sizes="(min-width: 640px) 33vw, 100vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-navy-900/85 via-navy-900/10 to-transparent" aria-hidden="true" />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between p-4">
              <span className="font-serif text-lg font-bold text-white sm:text-xl">{banner.label}</span>
              <ArrowRight
                className="h-5 w-5 shrink-0 text-white transition-transform group-hover:translate-x-1"
                aria-hidden="true"
              />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
