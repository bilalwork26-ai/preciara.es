import Link from "next/link";
import { ArrowRight } from "lucide-react";
import * as icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
 * Icono + degradado de marca en vez de fotografía: este equipo no tiene
 * forma de verificar desde este entorno que una URL de imagen externa
 * inventada no esté rota en producción (sin acceso de red a dominios de
 * imágenes), y ya hubo un incidente real de banners con imágenes rotas.
 * Un icono (mismo set y mismo campo `icon` que ya usa `demoCategories`,
 * resuelto igual que en CategoryRow.tsx) sobre un degradado de los tres
 * colores de marca (navy/teal/coral) es cero-riesgo y visualmente
 * consistente en las ocho tarjetas — decisión explícita del usuario.
 *
 * "Electrónica" enlaza a `tecnologia` (no existe un slug "electronica" en
 * la taxonomía); "Belleza y Salud" enlaza a `salud-cuidado`; "Bricolaje y
 * Jardín" enlaza a `jardin-bricolaje" — mismos nombres de categoría real,
 * con la etiqueta visual que pidió el usuario.
 */
const CATEGORY_BANNERS = [
  { slug: "moda", label: "Moda", icon: "Shirt", gradient: "from-navy-800 to-teal-700" },
  { slug: "deporte", label: "Deporte", icon: "Dumbbell", gradient: "from-teal-600 to-navy-900" },
  { slug: "tecnologia", label: "Electrónica", icon: "Laptop", gradient: "from-navy-900 to-navy-700" },
  { slug: "hogar", label: "Hogar", icon: "Home", gradient: "from-coral-600 to-navy-800" },
  { slug: "electrodomesticos", label: "Electrodomésticos", icon: "Refrigerator", gradient: "from-teal-700 to-navy-800" },
  { slug: "salud-cuidado", label: "Belleza y Salud", icon: "HeartPulse", gradient: "from-coral-500 to-navy-900" },
  { slug: "jardin-bricolaje", label: "Bricolaje y Jardín", icon: "Hammer", gradient: "from-navy-700 to-teal-600" },
  { slug: "infantil", label: "Infantil", icon: "Baby", gradient: "from-teal-500 to-navy-800" },
] as const;

export function CategoryBanners() {
  return (
    <section aria-labelledby="category-banners-heading">
      <h2 id="category-banners-heading" className="sr-only">
        Categorías destacadas
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {CATEGORY_BANNERS.map((banner) => {
          const Icon = (icons as unknown as Record<string, LucideIcon>)[banner.icon] ?? icons.Tag;
          return (
            <Link
              key={banner.slug}
              href={buildCategoryHref(banner.slug)}
              aria-label={`Ver ofertas en ${banner.label}`}
              className={`group relative flex h-32 flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br p-4 shadow-sm transition-transform duration-300 hover:scale-[1.02] sm:h-40 ${banner.gradient}`}
            >
              <Icon
                className="h-9 w-9 shrink-0 text-white/30 transition-transform duration-300 group-hover:scale-110 sm:h-11 sm:w-11"
                aria-hidden="true"
                strokeWidth={1.5}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="font-serif text-base font-bold text-white sm:text-lg">{banner.label}</span>
                <ArrowRight
                  className="h-4 w-4 shrink-0 text-white transition-transform group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
