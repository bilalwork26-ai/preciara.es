import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buildCategoryHref, CATEGORIES_INDEX_HREF } from "./categoryLinks";

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="category-banners-heading" className="font-serif text-lg font-semibold text-navy-900 sm:text-xl">
            Explora por categoría
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Compara precios y encuentra las mejores ofertas organizadas por sectores
          </p>
        </div>
        <Link
          href={CATEGORIES_INDEX_HREF}
          className="inline-flex w-fit shrink-0 items-center gap-1 rounded text-sm font-semibold text-teal-700 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
        >
          Ver todas las categorías
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {CATEGORY_BANNERS.map((banner) => (
          <Link
            key={banner.slug}
            href={buildCategoryHref(banner.slug)}
            aria-label={`Ver ofertas en ${banner.label}`}
            className="group relative flex h-56 overflow-hidden rounded-2xl bg-navy-900 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl sm:h-64"
          >
            {/* alt="": la imagen es puramente decorativa, el nombre de la categoría ya está en texto real justo debajo (nunca solo dentro de la foto). */}
            <Image
              src={banner.imageUrl}
              alt=""
              fill
              sizes="(min-width: 640px) 25vw, 50vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
            {/*
              from-black/95 (antes navy-900/85): sobre fotos claras (p. ej.
              Bricolaje, Electrónica) navy-900/85 seguía dejando pasar
              demasiado brillo de fondo bajo el texto blanco — negro puro
              a mayor opacidad, más el escalón intermedio via-black/50
              (antes /10), da el contraste que el texto/icono necesitan
              en cualquier foto, clara u oscura.
            */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent" aria-hidden="true" />
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
