import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { demoFeaturedProduct } from "@/data/demo/products";
import { formatPrice, calcDiscountPercent } from "@/lib/format";
import { MiniSparkline } from "@/components/ui/MiniSparkline";

export function PromoBannerMain() {
  const offer = demoFeaturedProduct.offers[0];
  const percent = offer.previousPrice ? calcDiscountPercent(offer.price, offer.previousPrice) : 0;

  return (
    <div className="relative min-h-[560px] overflow-hidden rounded-[2rem] bg-navy-900 sm:min-h-[420px] lg:min-h-[400px]">
      {/*
        object-position desplazado hacia la derecha: dejamos ver el estuche y
        los auriculares (que en la foto original quedan centro-derecha) sin
        que la tarjeta de precio, anclada también a la derecha, los tape.
      */}
      <Image
        src="/images/banner-headphones.webp"
        alt=""
        fill
        priority
        sizes="(min-width: 1024px) 62vw, 100vw"
        className="object-cover object-[85%_42%]"
      />
      {/* Degradado solo donde hace falta para garantizar legibilidad del texto. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-navy-900/85 via-navy-900/30 to-transparent"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-navy-900/50 to-transparent lg:hidden"
      />

      <div className="relative flex h-full flex-col gap-6 p-6 sm:p-8 lg:p-10">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-3 py-1 text-xs font-semibold text-white">
            Oferta destacada
          </span>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-ivory">
            Tecnología que te acompaña
          </span>
        </div>

        {/* Zona izquierda: texto y CTA. max-w mantiene el bloque en la franja izquierda, sin invadir el producto. */}
        <div className="max-w-xs sm:max-w-sm">
          <h1 className="font-serif text-4xl font-bold leading-[1.05] text-white sm:text-5xl">
            El mejor precio de hoy, aquí.
          </h1>
          <p className="mt-3 text-base text-navy-100">
            {demoFeaturedProduct.name}. Sonido que te acompaña a todas partes.
          </p>
          <a
            href="#panel-comparacion"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-coral-500 px-6 py-3 text-sm font-semibold text-navy-900 transition-colors hover:bg-coral-600 hover:text-white"
          >
            Ver oferta
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>

        {/* Zona derecha: precio e historial. Centrada verticalmente sobre el borde derecho, nunca sobre el estuche. */}
        <div className="mt-auto w-full rounded-2xl bg-white/95 p-4 shadow-lg backdrop-blur sm:absolute sm:right-6 sm:top-1/2 sm:mt-0 sm:w-64 sm:-translate-y-1/2">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-navy-900">{formatPrice(offer.price)}</span>
            {offer.previousPrice && (
              <span className="text-sm text-navy-300 line-through">{formatPrice(offer.previousPrice)}</span>
            )}
          </div>
          {percent > 0 && (
            <span className="mt-1 inline-block rounded-full bg-coral-100 px-2 py-0.5 text-xs font-semibold text-coral-600">
              −{percent}%
            </span>
          )}
          <div className="mt-3 border-t border-border pt-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-navy-300">
              Historial de precios (demo)
            </p>
            <MiniSparkline points={demoFeaturedProduct.priceHistory.slice(-6)} className="mt-1.5 h-10 w-full" />
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[11px] text-navy-300">
              <span>Precio mínimo {formatPrice(Math.min(...demoFeaturedProduct.priceHistory.map((p) => p.price)))}</span>
              <span>{offer.lastCheckedLabel}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
