import Link from "next/link";
import { ArrowRight, Layers, Search, ShoppingBag } from "lucide-react";
import { Container } from "@/components/ui/Container";

const steps = [
  {
    icon: Search,
    title: "Recopilamos ofertas",
    body: "Mediante fuentes autorizadas: APIs oficiales y feeds de programas de afiliación.",
  },
  {
    icon: Layers,
    title: "Organizamos y comparamos",
    body: "Agrupamos el mismo producto entre tiendas y guardamos su historial de precio.",
  },
  {
    icon: ShoppingBag,
    title: "Compras en la tienda",
    body: "Accedes directamente a la tienda elegida para completar la compra allí.",
  },
];

/**
 * Sección compacta de la portada, entre la cuadrícula de ofertas y la
 * marquesina. Fondo `bg-teal-50` (antes `bg-beige`, que creaba un salto
 * cromático brusco frente al resto de la portada, mayormente blanca):
 * un neutro casi blanco, ya usado en el resto de la interfaz (p. ej. el
 * icono de cada paso más abajo), da la franja informativa propia que
 * necesita sin competir con el hero ni con el grid de categorías justo
 * antes.
 */
export function HowItWorksSection() {
  return (
    <section className="bg-teal-50">
      <Container className="py-10 sm:py-12">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Cómo funciona</p>
            <h2 className="mt-1 font-serif text-xl font-semibold text-navy-900 sm:text-2xl">Cómo funciona Preciara</h2>
          </div>
          <Link
            href="/sobre-preciara"
            className="inline-flex w-fit items-center gap-1 rounded text-sm font-semibold text-teal-700 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
          >
            Sobre Preciara
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <ol className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-2xl border border-border bg-white p-5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50">
                <step.icon className="h-[18px] w-[18px] text-teal-700" aria-hidden="true" strokeWidth={1.75} />
              </div>
              <p className="mt-3 text-xs font-semibold text-navy-300">Paso {index + 1}</p>
              <h3 className="mt-0.5 font-serif text-base font-semibold text-navy-900">{step.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-navy-500">{step.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
          <Link
            href="/metodologia"
            className="rounded text-sm font-medium text-navy-500 underline decoration-navy-300 underline-offset-2 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
          >
            Ver metodología completa
          </Link>
          <Link
            href="/guias"
            className="rounded text-sm font-medium text-navy-500 underline decoration-navy-300 underline-offset-2 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
          >
            Explorar guías de compra
          </Link>
        </div>
      </Container>
    </section>
  );
}
