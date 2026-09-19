type LogoProps = {
  className?: string;
  markOnly?: boolean;
};

/**
 * Logotipo de Preciara: una marca de diamante (precisión, claridad) seguida
 * del nombre en tipografía serif. `markOnly` devuelve solo el símbolo, útil
 * para favicons o espacios reducidos.
 */
export function Logo({ className, markOnly = false }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <path d="M14 1.5 26.5 10 14 26.5 1.5 10 14 1.5Z" fill="var(--color-navy-800)" />
        <path d="M14 1.5 26.5 10 14 14 1.5 10 14 1.5Z" fill="var(--color-teal-600)" />
      </svg>
      {!markOnly && (
        <span className="font-serif text-xl font-semibold tracking-tight text-navy-900">
          Preciara
        </span>
      )}
    </span>
  );
}
