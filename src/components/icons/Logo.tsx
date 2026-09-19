type MarkProps = {
  className?: string;
};

/**
 * Símbolo de Preciara: una gema facetada (claridad, precisión) con tres
 * facetas en los tres colores de marca (navy, azul cristal, teal) y una
 * micro-línea de tendencia descendente con un punto coral, que evoca el
 * historial de precios y una bajada verificada. Sin caja ni fondo: la
 * silueta irregular de la gema es el propio contorno del logotipo.
 */
export function PreciaraMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <path
        d="M10 5 L22 5 L16 29 Z"
        fill="var(--color-crystal)"
        stroke="var(--color-navy-900)"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      <path
        d="M10 5 L4 13 L16 29 Z"
        fill="var(--color-navy-800)"
        stroke="var(--color-navy-900)"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      <path
        d="M22 5 L28 13 L16 29 Z"
        fill="var(--color-teal-600)"
        stroke="var(--color-navy-900)"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      <path
        d="M9 14 L14 17 L18 15 L22 19"
        fill="none"
        stroke="var(--color-ivory)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="22"
        cy="19"
        r="1.8"
        fill="var(--color-coral-500)"
        stroke="var(--color-ivory)"
        strokeWidth="0.6"
      />
    </svg>
  );
}

type LogoProps = {
  className?: string;
  markOnly?: boolean;
  markClassName?: string;
};

/**
 * Logotipo de Preciara: símbolo + nombre en tipografía serif. `markOnly`
 * devuelve solo el símbolo (favicon, cabecera móvil compacta).
 */
export function Logo({ className, markOnly = false, markClassName }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <PreciaraMark className={markClassName ?? "h-8 w-8 shrink-0"} />
      {!markOnly && (
        <span className="font-serif text-xl font-semibold tracking-tight text-navy-900">
          Preciara
        </span>
      )}
    </span>
  );
}
