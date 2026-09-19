import Link from "next/link";
import { Logo } from "@/components/icons/Logo";
import { Container } from "@/components/ui/Container";

const legalLinks = [
  { label: "Metodología", href: "/metodologia" },
  { label: "Aviso de afiliación", href: "/aviso-afiliacion" },
  { label: "Privacidad y cookies", href: "/privacidad" },
];

export function Footer() {
  return (
    <footer className="mt-16 border-t border-border bg-beige/40">
      <Container className="py-10">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-3 text-sm leading-relaxed text-navy-500">
              Comparador de precios español. Precios claros para decidir con
              calma, no con prisa.
            </p>
          </div>

          <nav aria-label="Enlaces legales">
            <h3 className="text-sm font-semibold text-navy-900">Información</h3>
            <ul className="mt-3 space-y-2">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-navy-500 transition-colors hover:text-teal-600"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <p className="mt-8 border-t border-border pt-6 text-xs leading-relaxed text-navy-500">
          Algunos enlaces de Preciara son enlaces de afiliado: si compras a
          través de ellos, podemos recibir una comisión, sin coste adicional
          para ti. Esto no influye en qué ofertas mostramos como verificadas.
          Consulta nuestro{" "}
          <Link href="/aviso-afiliacion" className="underline decoration-navy-300 underline-offset-2 hover:text-teal-600">
            aviso de afiliación
          </Link>
          .
        </p>

        <p className="mt-4 text-xs text-navy-300">
          © {new Date().getFullYear()} Preciara. Todos los precios mostrados en esta versión son datos de demostración.
        </p>
      </Container>
    </footer>
  );
}
