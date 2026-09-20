import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { demoFeaturedProduct } from "@/data/demo/products";
import { formatPrice, calcDiscountPercent } from "@/lib/format";
import { MiniSparkline } from "@/components/ui/MiniSparkline";

export function PromoBannerMain() {
  const offer = demoFeaturedProduct.offers[0];
  const percent = offer.previousPrice ? calcDiscountPercent(offer.price, offer.previousPrice) : 0;
  const minPrice = Math.min(...demoFeaturedProduct.priceHistory.map((p) => p.price));

  return (
    <div className="overflow-hidden rounded-[2rem] bg-navy-900">
      <div className="grid grid-cols-1 sm:grid-cols-2">
        {/* Columna izquierda: todo el contenido HTML, sobre navy sólido (sin tarjetas). */}
        <div className="flex flex-col justify-center gap-5 p-6 sm:p-8 lg:p-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-3 py-1 text-xs font-semibold text-white">
              Oferta destacada
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-ivory">
              Tecnología que te acompaña
            </span>
          </div>

          <div>
            <h1 className="font-serif text-4xl font-bold leading-[1.05] text-white sm:text-5xl">
              El mejor precio de hoy, aquí.
            </h1>
            <p className="mt-3 text-base text-navy-100">
              {demoFeaturedProduct.name}. Sonido que te acompaña a todas partes.
            </p>
          </div>

          <div>
            <div className="flex flex-wrap items-baseline gap-2.5">
              <span className="text-3xl font-bold text-white">{formatPrice(offer.price)}</span>
              {offer.previousPrice && (
                <span className="text-base text-navy-100 line-through">{formatPrice(offer.previousPrice)}</span>
              )}
              {percent > 0 && (
                <span className="rounded-full bg-coral-100 px-2.5 py-0.5 text-xs font-semibold text-coral-600">
                  −{percent}%
                </span>
              )}
            </div>

            <div className="mt-4 max-w-xs">
              <p className="text-[11px] font-medium uppercase tracking-wide text-navy-100">
                Historial de precios (demo)
              </p>
              <MiniSparkline
                points={demoFeaturedProduct.priceHistory.slice(-6)}
                stroke="var(--color-teal-500)"
                className="mt-1.5 h-12 w-full"
              />
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs text-navy-100">
                <span>Precio mínimo {formatPrice(minPrice)}</span>
                <span>Actualizado {offer.lastCheckedLabel}</span>
              </div>
            </div>
          </div>

          <a
            href="#panel-comparacion"
            className="inline-flex w-fit items-center gap-2 rounded-full bg-coral-500 px-6 py-3 text-sm font-semibold text-navy-900 transition-colors hover:bg-coral-600 hover:text-white"
          >
            Ver oferta
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>

        {/*
          Columna derecha: exclusivamente la fotografía. Ningún elemento se
          superpone al producto; como mucho, un degradado navy muy sutil en
          el borde de unión con la columna izquierda.
        */}
        <div className="relative min-h-[280px] sm:min-h-[420px] lg:min-h-[400px]">
          <Image
            src="/images/banner-headphones.webp"
            alt=""
            fill
            priority
            sizes="(min-width: 640px) 31vw, 100vw"
            className="object-cover object-[50%_38%]"
          />
          {/* Costura con la columna de texto: leve en móvil (arriba), en el borde izquierdo desde sm. */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-navy-900/45 to-transparent sm:hidden"
          />
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 hidden w-14 bg-gradient-to-r from-navy-900/45 to-transparent sm:block"
          />
        </div>
      </div>
    </div>
  );
}
