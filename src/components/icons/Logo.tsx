type MarkProps = {
  className?: string;
  /** "dark" = sobre fondos claros (tallo navy, teal estándar). "light" = sobre la cabecera navy (tallo marfil, teal más claro para mantener contraste). */
  theme?: "dark" | "light";
};

/**
 * Símbolo de Preciara: una "P" ancha y sólida formada por dos flechas
 * enfrentadas (arriba en azul cristal apuntando a la derecha, abajo en
 * teal apuntando a la izquierda) que representan la comparación de
 * precios, con un pequeño indicador coral de bajada de precio. Trazos
 * gruesos y sin huecos internos grandes para que la silueta se reconozca
 * de un vistazo, incluso a tamaño de favicon. Sin gema, sin caja exterior.
 */
export function PreciaraMark({ className, theme = "dark" }: MarkProps) {
  const ink = theme === "light" ? "var(--color-ivory)" : "var(--color-navy-900)";
  // El teal estándar (#087F78) apenas contrasta sobre el navy de la cabecera
  // (3.6:1): sobre fondo navy se usa el teal-500, más claro (5:1).
  const arrowTeal = theme === "light" ? "var(--color-teal-500)" : "var(--color-teal-600)";

  return (
    <svg viewBox="0 0 100 100" fill="none" aria-hidden="true" className={className}>
      {/* Tallo de la P */}
      <path d="M8 4 L24 4 L24 78 L16 96 L8 78 Z" fill={ink} />
      {/* Flecha superior: apunta a la derecha (azul cristal) */}
      <path d="M24 17 L64 17 L64 4 L88 25.5 L64 47 L64 34 L24 34 Z" fill="var(--color-crystal)" />
      {/* Flecha inferior: apunta a la izquierda (teal) */}
      <path d="M88 66 L48 66 L48 53 L24 74.5 L48 96 L48 83 L88 83 Z" fill={arrowTeal} />
      {/* Indicador coral de bajada de precio */}
      <path d="M76 48 L92 48 L84 58 Z" fill="var(--color-coral-500)" />
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
  const textColor = theme === "light" ? "text-ivory" : "text-navy-900";

  return (
    <span className={`inline-flex items-center gap-3 ${className ?? ""}`}>
      <PreciaraMark theme={theme} className={markClassName ?? "h-10 w-10 shrink-0"} />
      {!markOnly && (
        <span className={`font-serif text-2xl font-bold leading-none tracking-tight ${textColor}`}>
          Preciara
        </span>
      )}
    </span>
  );
}
