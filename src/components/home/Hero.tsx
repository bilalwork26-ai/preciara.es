import { getImageProps } from "next/image";
import { SearchForm } from "./SearchForm";
import { CategoryPills } from "./CategoryPills";

const HERO_ALT =
  "Portátil, auriculares, smartwatch y otros productos sobre un banco de mármol claro, con luz natural: la selección que compara Preciara.";

export function Hero() {
  const common = { alt: HERO_ALT, quality: 82 };

  const {
    props: { srcSet: desktopSrcSet },
  } = getImageProps({
    ...common,
    src: "/images/hero-desktop.webp",
    width: 1672,
    height: 941,
    sizes: "(min-width: 1024px) 50vw, 100vw",
  });

  const { props: imgProps } = getImageProps({
    ...common,
    src: "/images/hero-mobile.webp",
    width: 941,
    height: 1672,
    sizes: "100vw",
  });

  return (
    <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-beige/60 to-ivory">
      <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-12 sm:px-6 sm:pt-16 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
          <div className="max-w-2xl">
            <h1 className="font-serif text-4xl font-semibold leading-[1.1] tracking-tight text-navy-900 sm:text-5xl">
              Precios claros.
              <br />
              Compras inteligentes.
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-navy-500">
              Compara precios, sigue su evolución y compra siempre en el
              mejor momento.
            </p>

            <div className="mt-6">
              <SearchForm />
            </div>
          </div>

          {/*
            Art direction: dos imágenes distintas (recorte vertical en móvil,
            horizontal en escritorio). <picture> + <source media> hace que el
            navegador descargue solo la que corresponde, nunca las dos. Ver
            https://nextjs.org/docs/app/api-reference/components/image#art-direction
          */}
          <div className="aspect-[4/5] overflow-hidden rounded-2xl shadow-sm ring-1 ring-navy-900/5 md:aspect-[16/9]">
            <picture>
              {/* Tableta y escritorio (≥768px) comparten la imagen horizontal. */}
              <source media="(min-width: 768px)" srcSet={desktopSrcSet} />
              {/* eslint-disable-next-line jsx-a11y/alt-text -- alt viene de imgProps (common.alt vía getImageProps) */}
              <img
                {...imgProps}
                fetchPriority="high"
                className="h-full w-full object-cover object-[50%_78%] md:object-center"
              />
            </picture>
          </div>
        </div>

        <div id="categorias" className="mt-8 scroll-mt-24">
          <CategoryPills />
        </div>
      </div>
    </section>
  );
}
