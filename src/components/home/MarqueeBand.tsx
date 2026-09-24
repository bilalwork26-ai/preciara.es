import { marqueeMessages } from "@/data/marquee";

function MarqueeDot() {
  return <span aria-hidden="true" className="h-[3px] w-[3px] shrink-0 rounded-full bg-gold-400/80" />;
}

function MarqueeGroup({ dup }: { dup?: boolean }) {
  return (
    <div
      className={`flex shrink-0 items-center gap-x-4 pr-4 sm:gap-x-6 sm:pr-6 ${dup ? "marquee-dup" : ""}`}
      aria-hidden={dup ? "true" : undefined}
    >
      {marqueeMessages.map((msg, i) => (
        <span key={i} className="flex shrink-0 items-center gap-x-4 sm:gap-x-6">
          <span className="text-[10px] font-medium uppercase tracking-wide text-gold-400 sm:text-[11px]">{msg}</span>
          <MarqueeDot />
        </span>
      ))}
    </div>
  );
}

/**
 * Banda publicitaria continua de marca, justo antes del footer. Una cinta
 * fina (no un cartel): una única línea de texto pequeño, encuadrada por
 * dos líneas horizontales muy discretas (dorado apagado, baja opacidad)
 * que le dan el aspecto de cinta informativa en vez de "letras sueltas"
 * sobre el footer. Movimiento perpetuo, pura CSS: sin estado de React,
 * animación por `translateX`, pausa por CSS en :hover y :focus-within, y
 * una alternativa estática cuando el usuario prefiere menos movimiento
 * (ver globals.css). El fundido en ambos extremos ya lo resuelve
 * `.marquee-line` (mask-image hacia transparente, ver globals.css): como
 * el fondo de este contenedor es el mismo navy sólido que el footer justo
 * debajo, ese fundido a transparente ya se ve como un fundido hacia navy.
 */
export function MarqueeBand() {
  return (
    <div
      className="marquee-band relative flex min-h-[30px] items-center overflow-hidden bg-navy-900 sm:min-h-[34px]"
      tabIndex={0}
      aria-label="Mensajes publicitarios de Preciara"
    >
      {/* Líneas de encuadre: dorado muy apagado y a baja opacidad — nunca blancas ni gruesas — para que la cinta se lea como un elemento propio, no como texto flotando directamente sobre el footer. */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gold-600/25" />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px bg-gold-600/25" />

      <div className="marquee-line w-full">
        <div className="marquee-track" style={{ animationDuration: "34s" }}>
          <MarqueeGroup />
          <MarqueeGroup dup />
        </div>
      </div>
    </div>
  );
}
