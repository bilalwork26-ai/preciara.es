import Image from "next/image";
import { ArrowRight } from "lucide-react";

/**
 * Hero estático único de la portada: sustituye a los dos banners
 * anteriores (PromoBannerMain + PromoBannerSecondary). Es deliberadamente
 * un componente de servidor sin ningún efecto ligado al puntero ni JS
 * visual de ningún tipo — porque el catálogo real tiene muchos productos
 * de muchas categorías, y anclar el hero al precio de uno solo sería
 * engañoso. Todo el texto es HTML real, server-renderizado: sigue siendo
 * legible, accesible y adaptable con JavaScript desactivado.
 */
export function Hero() {
  return (
    <div className="overflow-hidden rounded-[2rem] bg-navy-900">
      <div className="grid grid-cols-1 sm:grid-cols-[42fr_58fr] sm:min-h-[420px] lg:min-h-[460px]">
        <div className="flex flex-col justify-center gap-3 p-6 sm:p-8 lg:p-10">
          <span className="w-fit rounded-full bg-teal-600 px-3 py-1 text-xs font-semibold text-white">
            Compara y ahorra
          </span>

          <h1 className="font-serif text-3xl font-bold leading-[1.1] text-white sm:text-4xl lg:text-5xl">
            Los mejores productos. Las mejores ofertas.
          </h1>

          <p className="max-w-md text-sm text-navy-100 sm:text-base">
            Moda, hogar, tecnología, belleza y mucho más, comparado para ti.
          </p>

          <a
            href="/buscar"
            className="mt-2 inline-flex w-fit items-center gap-2 rounded-full bg-coral-500 px-6 py-2.5 text-sm font-semibold text-navy-900 transition-colors hover:bg-coral-600 hover:text-white"
          >
            Descubrir ofertas
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>

          <p className="text-xs text-navy-100">Precios claros · Varias tiendas</p>
        </div>

        {/*
          Columna/franja de la fotografía: una única imagen real (nunca
          capas de producto separadas), con `object-cover` recortado hacia
          la derecha (`object-right`). El recorte de `object-fit: cover`
          contra este lienzo es siempre horizontal, nunca vertical (el
          contenedor es siempre menos ancho que la proporción real de la
          foto, 1680x729), así que fijar el recorte a la derecha basta —
          verificado a mano en 320/360/390/412/1440px — para mantener
          visibles siempre la ropa, la zapatilla, el móvil, la cafetera, los
          botes de belleza y el balón, sin depender de una posición
          distinta por breakpoint.
        */}
        <div className="min-h-56 sm:min-h-0">
          <div className="relative h-full w-full">
            <Image
              src="/images/home/hero-lifestyle-collection-v1.webp"
              alt="Colección de productos destacados: abrigo y jersey sobre maniquí, zapatilla, móvil, cafetera y cosmética sobre un pedestal de piedra"
              fill
              priority
              sizes="(min-width: 1024px) 58vw, (min-width: 640px) 58vw, 100vw"
              className="object-cover object-right"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
