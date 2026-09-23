import Link from "next/link";
import { Logo } from "@/components/icons/Logo";
import { Container } from "@/components/ui/Container";

const legalLinks = [
  { label: "Metodología", href: "/metodologia" },
  { label: "Aviso de afiliación", href: "/aviso-afiliacion" },
  { label: "Privacidad y cookies", href: "/privacidad" },
];

/** Anillo de foco propio (en vez del `outline` teal por defecto de globals.css): sobre este fondo navy, un anillo blanco con hueco navy es el que de verdad se ve. */
const FOCUS_RING_CLASSES =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900";

export function Footer() {
  // Mismo `bg-navy-900` que MarqueeBand (justo encima en la portada, ver
  // page.tsx) y sin margen/borde superior: footer y banda forman un único
  // bloque azul continuo, sin franja del fondo blanco de la página entre
  // ellos.
  return (
    <footer className="bg-navy-900">
      <Container className="py-10">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <Logo theme="light" />
            <p className="mt-3 text-sm leading-relaxed text-navy-100">
              Comparador de precios español. Precios claros para decidir con
              calma, no con prisa.
            </p>
          </div>

          <nav aria-label="Enlaces legales">
            <h3 className="text-sm font-semibold text-white">Información</h3>
            <ul className="mt-3 space-y-2">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`rounded text-sm text-navy-100 transition-colors hover:text-white ${FOCUS_RING_CLASSES}`}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <p className="mt-8 border-t border-border-navy pt-6 text-xs leading-relaxed text-navy-100">
          Algunos enlaces de Preciara son enlaces de afiliado: si compras a
          través de ellos, podemos recibir una comisión, sin coste adicional
          para ti. Esto no influye en qué ofertas mostramos como verificadas.
          Consulta nuestro{" "}
          <Link
            href="/aviso-afiliacion"
            className={`rounded underline decoration-navy-300 underline-offset-2 hover:text-white ${FOCUS_RING_CLASSES}`}
          >
            aviso de afiliación
          </Link>
          .
        </p>

        <p className="mt-4 text-xs text-navy-100">
          © {new Date().getFullYear()} Preciara. Todos los precios mostrados en esta versión son datos de demostración.
        </p>
      </Container>
    </footer>
  );
}
