import Image from "next/image";
import { ArrowRight, Tag } from "lucide-react";
import { Container } from "@/components/ui/Container";

/**
 * Hero estático único de la portada: sustituye a los dos banners
 * anteriores (PromoBannerMain + PromoBannerSecondary). Es deliberadamente
 * un componente de servidor sin ningún efecto ligado al puntero ni JS
 * visual de ningún tipo — porque el catálogo real tiene muchos productos
 * de muchas categorías, y anclar el hero al precio de uno solo sería
 * engañoso. Todo el texto es HTML real, server-renderizado: sigue siendo
 * legible, accesible y adaptable con JavaScript desactivado.
 *
 * La fotografía NUNCA es una columna/tarjeta rectangular independiente:
 * es una capa de fondo (`absolute inset-0`, detrás del texto) que se
 * funde con el navy de la sección mediante `.hero-fade-x`/`.hero-fade-y`
 * (ver globals.css) — un degradado real, no un simple cambio de color.
 * Dos disposiciones distintas (nunca una sola escalada):
 * - Escritorio (`sm:` en adelante): la imagen vive dentro de la propia
 *   sección (`<section>`, ancho completo, fuera de `Container`), anclada
 *   a la derecha, y el degradado horizontal funde su borde izquierdo bajo
 *   el texto y su borde derecho contra el navy — "no debe poder
 *   identificarse dónde empieza o termina la imagen".
 * - Móvil (< `sm`): el texto vuelve al flujo normal arriba; la foto ocupa
 *   su propio bloque de ancho completo debajo (también fuera de
 *   `Container`, nunca con un margen negativo), con un degradado que
 *   funde su borde superior y ambos laterales con el navy.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-navy-900">
      {/*
        Escritorio: imagen de fondo de toda la sección, nunca una columna
        con ancho propio del 58% — el degradado necesita ver navy sólido
        más allá del final del texto para que la unión quede invisible.
      */}
      <div className="absolute inset-0 hidden sm:block">
        <div className="absolute right-0 top-0 h-full w-[64%]">
          <Image
            src="/images/home/hero-lifestyle-collection-v1.webp"
            alt="Colección de productos destacados: abrigo y jersey sobre maniquí, zapatilla, móvil, cafetera y cosmética sobre un pedestal de piedra"
            fill
            priority
            sizes="64vw"
            className="object-cover object-right"
          />
        </div>
        <div className="hero-fade-x absolute inset-0" aria-hidden="true" />
      </div>

      <Container>
        <div className="relative z-10 flex flex-col justify-center gap-3 py-8 sm:min-h-[380px] sm:max-w-md sm:py-0 lg:min-h-[420px] lg:max-w-lg">
          <h1 className="font-serif text-3xl font-bold leading-[1.1] text-white sm:text-4xl lg:text-5xl">
            Los mejores productos. Las mejores ofertas.
          </h1>

          <p className="max-w-md text-sm text-navy-100 sm:text-base">
            Moda, hogar, tecnología, belleza y mucho más, comparado para ti.
          </p>

          <span
            className="inline-flex h-6 w-fit items-center gap-1 rounded-full border border-coral-500 px-2.5 text-[11px] font-semibold text-coral-500 sm:h-7 sm:gap-1.5 sm:px-3 sm:text-xs"
            aria-label="Descuento de hasta el 70 % en productos seleccionados"
          >
            <Tag className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
            Hasta −70 %
          </span>

          <a
            href="/buscar"
            className="mt-2 inline-flex w-fit items-center gap-2 rounded-full bg-coral-500 px-6 py-2.5 text-sm font-semibold text-navy-900 transition-colors hover:bg-coral-600 hover:text-white"
          >
            Descubrir ofertas
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>

          <p className="text-xs text-navy-100">Precios claros · Varias tiendas</p>
        </div>
      </Container>

      {/*
        Móvil: bloque de foto propio, ancho completo (hermano de
        `Container`, nunca con margen negativo), con degradado superior +
        lateral hacia el navy del bloque de texto de justo encima.
      */}
      <div className="relative h-72 sm:hidden">
        <Image
          src="/images/home/hero-lifestyle-collection-v1.webp"
          alt="Colección de productos destacados: abrigo y jersey sobre maniquí, zapatilla, móvil, cafetera y cosmética sobre un pedestal de piedra"
          fill
          sizes="100vw"
          className="object-cover object-[68%_center]"
        />
        <div className="hero-fade-y absolute inset-0" aria-hidden="true" />
      </div>
    </section>
  );
}
