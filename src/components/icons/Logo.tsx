type MarkProps = {
  className?: string;
  /** Color del "tallo" de la P. Blanco/marfil sobre fondos navy, navy sobre fondos claros. */
  ink?: string;
};

/**
 * Símbolo de Preciara: una "P" formada por dos flechas enfrentadas (arriba
 * en azul cristal apuntando a la derecha, abajo en teal apuntando a la
 * izquierda) que representan la comparación de precios entre tiendas, con
 * un pequeño indicador coral de bajada de precio en el punto donde ambas
 * casi se tocan. Sin gema, sin diamante, sin caja exterior.
 */
export function PreciaraMark({ className, ink = "var(--color-navy-900)" }: MarkProps) {
  return (
    <svg viewBox="0 0 68 70" fill="none" aria-hidden="true" className={className}>
      {/* Tallo de la P */}
      <path d="M4 4 L16 4 L16 58 L10 66 L4 58 Z" fill={ink} />
      {/* Flecha superior: apunta a la derecha (azul cristal) */}
      <path
        d="M16 13 L38 13 L38 6 L56 18 L38 30 L38 23 L16 23 Z"
        fill="var(--color-crystal)"
      />
      {/* Flecha inferior: apunta a la izquierda (teal) */}
      <path
        d="M56 45 L34 45 L34 38 L16 50 L34 62 L34 55 L56 55 Z"
        fill="var(--color-teal-600)"
      />
      {/* Indicador coral de bajada de precio */}
      <path d="M50 31 L62 31 L56 41 Z" fill="var(--color-coral-500)" />
    </svg>
  );
}

type LogoProps = {
  className?: string;
  markOnly?: boolean;
  markClassName?: string;
  /** "dark" = sobre fondos claros (tallo/texto navy). "light" = sobre fondo navy (tallo/texto blancos). */
  theme?: "dark" | "light";
};

/**
 * Logotipo de Preciara: símbolo + nombre en serif. `markOnly` devuelve solo
 * el símbolo (favicon, cabecera móvil muy compacta). `theme="light"` se usa
 * sobre la cabecera navy; `theme="dark"` (por defecto) sobre fondos claros.
 */
export function Logo({ className, markOnly = false, markClassName, theme = "dark" }: LogoProps) {
  const ink = theme === "light" ? "var(--color-ivory)" : "var(--color-navy-900)";
  const textColor = theme === "light" ? "text-ivory" : "text-navy-900";

  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <PreciaraMark ink={ink} className={markClassName ?? "h-9 w-9 shrink-0"} />
      {!markOnly && (
        <span className={`font-serif text-xl font-bold tracking-tight ${textColor}`}>
          Preciara
        </span>
      )}
    </span>
  );
}
