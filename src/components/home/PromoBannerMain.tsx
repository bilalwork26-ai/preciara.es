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
      <div className="grid grid-cols-1 sm:min-h-[380px] sm:grid-cols-2 lg:min-h-[420px]">
        {/* Columna izquierda: todo el contenido HTML, sobre navy sólido (sin tarjetas). */}
        <div className="flex flex-col justify-center gap-2 p-6 sm:p-7 lg:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-3 py-1 text-xs font-semibold text-white">
              Oferta destacada
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-ivory">
              Tecnología que te acompaña
            </span>
          </div>

          <div>
            <h1 className="font-serif text-3xl font-bold leading-[1.1] text-white sm:text-4xl">
              El mejor precio de hoy, aquí.
            </h1>
            <p className="mt-2 text-sm text-navy-100 sm:text-base">
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

            <div className="mt-2 max-w-xs">
              <p className="text-[11px] font-medium uppercase tracking-wide text-navy-100">
                Historial de precios (demo)
              </p>
              <MiniSparkline
                points={demoFeaturedProduct.priceHistory.slice(-6)}
                stroke="var(--color-teal-500)"
                className="mt-1 h-8 w-full"
              />
              <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs text-navy-100">
                <span>Precio mínimo {formatPrice(minPrice)}</span>
                <span>Actualizado {offer.lastCheckedLabel}</span>
              </div>
            </div>
          </div>

          <a
            href="#panel-comparacion"
            className="inline-flex w-fit items-center gap-2 rounded-full bg-coral-500 px-6 py-2.5 text-sm font-semibold text-navy-900 transition-colors hover:bg-coral-600 hover:text-white"
          >
            Ver oferta
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>

        {/*
          Columna derecha: exclusivamente la fotografía (cuadrada, creada
          para este espacio). object-contain: nunca se recorta el producto,
          solo se reduce si hiciera falta. Fondo navy igual que el de la
          columna de texto, compatible con el fondo de la foto.
        */}
        <div className="min-h-[300px] p-4 sm:min-h-0 sm:p-6">
          {/*
            La imagen fill se ancla a la caja de relleno (padding box) de su
            propio contenedor, así que el margen real se consigue con un div
            interior sin padding: el padding vive en el exterior.
          */}
          <div className="relative h-full w-full">
            <Image
              src="/images/hero-earbuds-square-v2.webp"
              alt="Auriculares inalámbricos Pro con su estuche de carga abierto, mostrando ambos auriculares completos"
              fill
              priority
              sizes="(min-width: 640px) 31vw, 90vw"
              className="object-contain object-center"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
