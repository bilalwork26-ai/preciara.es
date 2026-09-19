import { getImageProps } from "next/image";
import { Container } from "@/components/ui/Container";
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
    sizes: "(min-width: 1024px) 54vw, 100vw",
  });

  const { props: imgProps } = getImageProps({
    ...common,
    src: "/images/hero-mobile.webp",
    width: 941,
    height: 1672,
    sizes: "100vw",
  });

  return (
    <section className="border-b border-border bg-gradient-to-b from-beige/60 to-ivory">
      <Container className="pb-6 pt-6 sm:pt-8 lg:pb-8 lg:pt-10">
        {/*
          Composición unificada: un único panel contiene texto, buscador e
          imagen. Solo el panel exterior tiene esquinas redondeadas; la foto
          rellena su columna borde a borde y queda recortada por el propio
          `overflow-hidden` del panel, así que nunca parece una tarjeta
          independiente.
        */}
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-white via-white to-crystal-100/40">
          <div className="grid lg:grid-cols-[0.85fr_1fr] lg:items-stretch">
            <div className="flex flex-col justify-center gap-5 px-6 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-14">
              <h1 className="font-serif text-4xl font-semibold leading-[1.1] tracking-tight text-navy-900 sm:text-5xl">
                Precios claros.
                <br />
                Compras inteligentes.
              </h1>
              <p className="max-w-md text-lg leading-relaxed text-navy-500">
                Compara precios, sigue su evolución y compra siempre en el
                mejor momento.
              </p>

              <SearchForm />
            </div>

            {/*
              Art direction: dos imágenes distintas (recorte vertical en
              móvil, horizontal en tableta/escritorio). <picture> + <source
              media> hace que el navegador descargue solo la que
              corresponde, nunca las dos. Ver
              https://nextjs.org/docs/app/api-reference/components/image#art-direction
            */}
            <div className="relative aspect-[4/5] md:aspect-[16/9] lg:aspect-auto">
              <picture>
                <source media="(min-width: 768px)" srcSet={desktopSrcSet} />
                {/* eslint-disable-next-line jsx-a11y/alt-text -- alt viene de imgProps (common.alt vía getImageProps) */}
                <img
                  {...imgProps}
                  fetchPriority="high"
                  className="absolute inset-0 h-full w-full object-cover object-[50%_78%] md:object-center"
                />
              </picture>
              {/* Funde el borde de la foto con el panel en vez de un corte duro. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 hidden w-24 bg-gradient-to-r from-white/85 to-transparent lg:block"
              />
            </div>
          </div>
        </div>

        <div id="categorias" className="mt-4 scroll-mt-24 sm:mt-5">
          <CategoryPills />
        </div>
      </Container>
    </section>
  );
}
