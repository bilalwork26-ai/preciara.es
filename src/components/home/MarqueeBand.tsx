import { marqueePrimaryMessages, marqueeSecondaryMessages } from "@/data/marquee";

function MarqueeSeparator() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-2.5 w-2.5 shrink-0 text-coral-500" fill="currentColor">
      <path d="M8 0 L9.6 6.4 L16 8 L9.6 9.6 L8 16 L6.4 9.6 L0 8 L6.4 6.4 Z" />
    </svg>
  );
}

function MarqueeGroup({
  messages,
  dup,
  textClassName,
}: {
  messages: string[];
  dup?: boolean;
  textClassName: string;
}) {
  return (
    <div
      className={`flex shrink-0 items-center gap-x-6 pr-6 sm:gap-x-8 sm:pr-8 ${dup ? "marquee-dup" : ""}`}
      aria-hidden={dup ? "true" : undefined}
    >
      {messages.map((msg, i) => (
        <span key={i} className="flex shrink-0 items-center gap-x-6 sm:gap-x-8">
          <span className={textClassName}>{msg}</span>
          <MarqueeSeparator />
        </span>
      ))}
    </div>
  );
}

function MarqueeLine({
  messages,
  reverse,
  durationSeconds,
  textClassName,
}: {
  messages: string[];
  reverse?: boolean;
  durationSeconds: number;
  textClassName: string;
}) {
  return (
    <div className="marquee-line w-full">
      <div
        className="marquee-track"
        data-dir={reverse ? "reverse" : undefined}
        style={{ animationDuration: `${durationSeconds}s` }}
      >
        <MarqueeGroup messages={messages} textClassName={textClassName} />
        <MarqueeGroup messages={messages} dup textClassName={textClassName} />
      </div>
    </div>
  );
}

/** Fondo decorativo: resplandores animados teal/cristal + línea de precio muy sutil. */
function MarqueeBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="carousel-glow absolute -left-16 -top-20 h-56 w-56 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--color-teal-600), transparent 70%)" }}
      />
      <div
        className="carousel-glow-delay absolute -right-16 -bottom-16 h-56 w-56 rounded-full opacity-25 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--color-crystal), transparent 70%)" }}
      />
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.12]"
        viewBox="0 0 400 150"
        preserveAspectRatio="none"
        fill="none"
      >
        <path
          d="M0 112 L50 92 L100 102 L150 62 L200 78 L250 42 L300 58 L350 26 L400 38"
          stroke="var(--color-crystal)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/**
 * Banda publicitaria continua de marca, justo antes del footer. Dos líneas
 * de texto en movimiento perpetuo (sentidos opuestos), pura CSS: sin
 * estado de React, animación por `translateX`, pausa por CSS en :hover y
 * :focus-within, y una alternativa estática cuando el usuario prefiere
 * menos movimiento (ver globals.css).
 */
export function MarqueeBand() {
  return (
    <div
      className="marquee-band relative flex min-h-[120px] flex-col items-center justify-center gap-3 overflow-hidden border-y border-border-navy bg-navy-900 py-4 sm:min-h-[135px] sm:gap-4 lg:min-h-[150px]"
      tabIndex={0}
      aria-label="Mensajes publicitarios de Preciara"
    >
      <MarqueeBackground />

      <MarqueeLine
        messages={marqueePrimaryMessages}
        durationSeconds={25}
        textClassName="text-base font-bold uppercase tracking-wide text-white sm:text-lg lg:text-xl"
      />
      <MarqueeLine
        messages={marqueeSecondaryMessages}
        reverse
        durationSeconds={34}
        textClassName="text-xs font-medium uppercase tracking-wide text-navy-100 sm:text-sm lg:text-base"
      />
    </div>
  );
}
