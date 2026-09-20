import Image from "next/image";
import { ArrowRight, Layers, Scale, ShieldCheck } from "lucide-react";

const indicators = [
  { icon: Scale, label: "Comparativa de modelos" },
  { icon: Layers, label: "Varias tiendas" },
  { icon: ShieldCheck, label: "Precios revisados" },
];

export function PromoBannerSecondary() {
  return (
    <div className="overflow-hidden rounded-[2rem] bg-ivory">
      <div className="grid grid-cols-1 sm:min-h-[380px] sm:grid-cols-2 lg:min-h-[420px]">
        {/* Columna izquierda: todo el contenido HTML, nunca sobre el portátil. */}
        <div className="flex flex-col justify-center gap-2 p-6 sm:p-7 lg:p-7">
          <span className="w-fit rounded-full bg-navy-900/5 px-3 py-1 text-xs font-semibold text-navy-700">
            Especial portátiles
          </span>

          <div>
            <h2 className="font-serif text-2xl font-bold leading-[1.1] text-navy-900 sm:text-3xl">
              Rendimiento para todo lo que viene.
            </h2>
            <p className="mt-2 text-sm text-navy-500">Compara los mejores portátiles de 2026.</p>
          </div>

          <a
            href="/buscar?categoria=tecnologia"
            className="inline-flex w-fit items-center gap-2 rounded-full bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
          >
            Ver portátiles
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>

          <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
            {indicators.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-1.5 text-xs font-medium text-navy-700">
                <Icon className="h-3.5 w-3.5 shrink-0 text-teal-600" aria-hidden="true" strokeWidth={1.75} />
                {label}
              </li>
            ))}
          </ul>
        </div>

        {/*
          Columna derecha: exclusivamente la fotografía (cuadrada, creada
          para este espacio). object-contain: el portátil se ve entero, con
          teclado, trackpad y esquinas, sin recortes. Fondo marfil, igual
          que el de la foto, para que se integren.
        */}
        <div className="min-h-[280px] p-4 sm:min-h-0 sm:p-6">
          <div className="relative h-full w-full">
            <Image
              src="/images/laptop-square-v2.webp"
              alt="Portátil abierto sobre una mesa, con teclado, trackpad y pantalla completos"
              fill
              sizes="(min-width: 640px) 31vw, 90vw"
              className="object-contain object-center"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
