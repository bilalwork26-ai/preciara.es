import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buildCategoryHref } from "./categoryLinks";

/**
 * Ocho banners visuales, uno por categoría real de la taxonomía (ver
 * `src/data/demo/categories.ts`, también la fuente del seed de la tabla
 * `Category` — ver `prisma/seed.ts`). Cada banner enlaza directamente a su
 * `/categoria/[slug]` real (nunca a `/buscar?categoria=...`, excluida de
 * robots.txt) y nunca cae en un 404 aunque esa categoría esté vacía de
 * catálogo real en un momento dado: `/categoria/[slug]` ya resuelve
 * BD-o-demo (ver categoryLinks.ts).
 *
 * Fotografía real + degradado oscuro superpuesto (nunca solo icono): este
 * equipo no tiene ninguna vía de red hacia dominios de imágenes desde este
 * entorno (confirmado varias veces, con curl y con WebFetch — ver el
 * propio historial de esta conversación), así que no puede obtener ni
 * verificar por su cuenta que una URL de foto inventada no esté rota, ni
 * que el contenido de una foto ya asignada sea el correcto para su
 * categoría. Todas las URLs de este fichero las facilitó explícitamente
 * el usuario, verificadas en su propio navegador contra el sitio real —
 * nunca inventadas aquí. La asignación Moda/Deporte se corrigió tras un
 * reporte del usuario con una captura real de producción: la foto que
 * llevaba "Moda" era en realidad de gimnasio/pesas (ahora en "Deporte"),
 * y la URL que llevaba "Deporte" no cargaba.
 * El degradado oscuro (`from-navy-900/85 via-navy-900/10 to-transparent`,
 * igual que el diseño original) garantiza que el texto blanco se lea con
 * claridad sobre cualquier foto, sin depender del contenido de la imagen.
 */
const CATEGORY_BANNERS = [
  {
    slug: "moda",
    label: "Moda",
    imageUrl: "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=800&q=80",
  },
  {
    slug: "deporte",
    label: "Deporte",
    imageUrl: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=800&q=80",
  },
  {
    slug: "tecnologia",
    label: "Electrónica",
    imageUrl: "https://images.unsplash.com/photo-1498049794561-7780e7231661?w=800&q=80",
  },
  {
    slug: "hogar",
    label: "Hogar",
    imageUrl: "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=800&q=80",
  },
  {
    slug: "electrodomesticos",
    label: "Electrodomésticos",
    imageUrl: "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=800&q=80",
  },
  {
    slug: "salud-cuidado",
    label: "Belleza y Salud",
    imageUrl: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80",
  },
  {
    slug: "jardin-bricolaje",
    label: "Bricolaje y Jardín",
    imageUrl: "https://images.unsplash.com/photo-1581783342308-f792dbdd27c5?auto=format&fit=crop&w=800&q=80",
  },
  {
    slug: "infantil",
    label: "Infantil",
    imageUrl: "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?auto=format&fit=crop&w=800&q=80",
  },
] as const;

export function CategoryBanners() {
  return (
    <section aria-labelledby="category-banners-heading">
      <h2 id="category-banners-heading" className="sr-only">
        Categorías destacadas
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {CATEGORY_BANNERS.map((banner) => (
          <Link
            key={banner.slug}
            href={buildCategoryHref(banner.slug)}
            aria-label={`Ver ofertas en ${banner.label}`}
            className="group relative flex h-56 overflow-hidden rounded-2xl bg-navy-900 shadow-sm sm:h-64"
          >
            {/* alt="": la imagen es puramente decorativa, el nombre de la categoría ya está en texto real justo debajo (nunca solo dentro de la foto). */}
            <Image
              src={banner.imageUrl}
              alt=""
              fill
              sizes="(min-width: 640px) 25vw, 50vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-navy-900/85 via-navy-900/10 to-transparent" aria-hidden="true" />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 p-6">
              <span className="font-serif text-xl font-bold text-white sm:text-2xl">{banner.label}</span>
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
