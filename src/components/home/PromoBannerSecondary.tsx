import Image from "next/image";
import { ArrowRight, Layers, Scale, ShieldCheck } from "lucide-react";

const indicators = [
  { icon: Scale, label: "Comparativa de modelos" },
  { icon: Layers, label: "Varias tiendas" },
  { icon: ShieldCheck, label: "Precios revisados" },
];

export function PromoBannerSecondary() {
  return (
    <div className="relative min-h-[320px] overflow-hidden rounded-[2rem] bg-ivory sm:min-h-[380px] lg:min-h-[440px]">
      <Image
        src="/images/banner-laptop.webp"
        alt=""
        fill
        sizes="(min-width: 1024px) 34vw, 100vw"
        className="object-cover object-[38%_50%]"
      />
      {/* Degradado solo donde hace falta para garantizar legibilidad del texto. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-white/92 via-white/55 to-transparent"
      />

      <div className="relative flex h-full flex-col justify-between p-6 sm:p-8 lg:p-10">
        <span className="w-fit rounded-full bg-navy-900/5 px-3 py-1 text-xs font-semibold text-navy-700">
          Especial portátiles
        </span>

        <div className="max-w-[15rem]">
          <h2 className="font-serif text-2xl font-bold leading-[1.1] text-navy-900 sm:text-3xl">
            Rendimiento para todo lo que viene.
          </h2>
          <p className="mt-2 text-sm text-navy-500">Compara los mejores portátiles de 2026.</p>
          <a
            href="/buscar?categoria=tecnologia"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
          >
            Ver portátiles
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>

        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          {indicators.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-1.5 text-xs font-medium text-navy-700">
              <Icon className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" strokeWidth={1.75} />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
