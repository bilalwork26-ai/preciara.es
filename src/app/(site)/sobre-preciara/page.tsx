import type { Metadata } from "next";
import Link from "next/link";
import { Eye, Handshake, Info, RefreshCw, ShieldCheck } from "lucide-react";
import { buildAboutPageJsonLd, buildBreadcrumbList } from "@/lib/seo";
import { serializeJsonLd } from "@/lib/jsonLd";
import { Container } from "@/components/ui/Container";

const title = "Sobre Preciara";
const description =
  "Qué es Preciara, cuál es su misión y cómo se financia: un comparador de precios español que acaba de empezar, explicado con transparencia.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/sobre-preciara" },
  openGraph: { title, description, type: "website" },
  twitter: { card: "summary", title, description },
};

const principles = [
  {
    icon: Eye,
    title: "Claridad",
    body: "Mostramos el precio y las condiciones tal como los indica cada tienda, sin letra pequeña ni cifras infladas de referencia.",
  },
  {
    icon: ShieldCheck,
    title: "Independencia editorial",
    body: "Qué ofertas mostramos, en qué orden y qué marcamos como verificado no depende de qué tienda paga más comisión.",
  },
  {
    icon: RefreshCw,
    title: "Actualización de precios",
    body: "Revisamos los precios con la frecuencia que permite cada fuente. Un precio solo se marca como verificado si se comprobó a tiempo.",
  },
  {
    icon: Handshake,
    title: "Transparencia en afiliación",
    body: "Cuando un enlace es de afiliado, lo explicamos con claridad: qué significa para ti y qué no cambia por ello.",
  },
];

const steps = [
  {
    title: "Recopilamos ofertas",
    body: "Reunimos precios y disponibilidad de tiendas mediante fuentes autorizadas: APIs oficiales, feeds de programas de afiliación u otras vías expresamente permitidas.",
  },
  {
    title: "Organizamos y comparamos",
    body: "Agrupamos ofertas del mismo producto entre distintas tiendas y guardamos su historial de precio para que se vea la evolución real.",
  },
  {
    title: "Accedes a la tienda",
    body: "Tú decides: al hacer clic en una oferta, te llevamos directamente a la tienda correspondiente para completar la compra allí.",
  },
];

/**
 * Página corporativa "Sobre Preciara": qué es, misión, principios y cómo
 * se financia, sin cifras ni nombres que no podamos confirmar (Preciara
 * es un comparador de reciente lanzamiento). Mismo patrón de hero navy que
 * `/guias` (ver src/app/(site)/guias/page.tsx) para mantener el sitio
 * integrado.
 */
export default function SobrePreciaraPage() {
  const breadcrumbJsonLd = buildBreadcrumbList([
    { name: "Inicio", path: "/" },
    { name: "Sobre Preciara", path: "/sobre-preciara" },
  ]);
  const aboutJsonLd = buildAboutPageJsonLd({ name: title, description }, "/sobre-preciara");

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(aboutJsonLd) }} />

      <section className="bg-navy-900">
        <Container className="py-12 sm:py-16">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-crystal px-3 py-1 text-xs font-semibold tracking-wide text-crystal">
            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            SOBRE PRECIARA
          </span>

          <h1 className="mt-4 max-w-2xl font-serif text-3xl font-bold leading-[1.1] text-white sm:text-4xl lg:text-5xl">
            Comparar con claridad, desde el primer día.
          </h1>

          <p className="mt-4 max-w-2xl text-sm text-navy-100 sm:text-base">
            Preciara es un comparador de precios español que acaba de
            empezar. Nuestro objetivo es sencillo: ayudarte a encontrar el
            mismo producto al mejor precio, con información clara y sin
            depender de una sola tienda.
          </p>
        </Container>
      </section>

      <Container className="max-w-3xl py-12 sm:py-16">
        <section>
          <h2 className="font-serif text-xl font-semibold text-navy-900">Qué es Preciara</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-navy-700">
            Preciara compara precios de productos entre distintas tiendas
            españolas para ayudarte a decidir cuándo y dónde comprar. No
            vendemos productos directamente: reunimos información de tiendas
            asociadas y la presentamos de forma ordenada para que la
            decisión final sea tuya.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="font-serif text-xl font-semibold text-navy-900">Nuestra misión</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-navy-700">
            Ayudarte a comparar precios y comprar con información: que antes
            de pagar sepas si el precio es realmente competitivo, cómo ha
            evolucionado y qué condiciones ofrece cada tienda, sin tener que
            abrir diez pestañas para averiguarlo.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="font-serif text-xl font-semibold text-navy-900">Nuestros principios</h2>
          <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {principles.map((principle) => (
              <li key={principle.title} className="rounded-2xl border border-border bg-white p-5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50">
                  <principle.icon className="h-[18px] w-[18px] text-teal-700" aria-hidden="true" strokeWidth={1.75} />
                </div>
                <h3 className="mt-3 font-serif text-base font-semibold text-navy-900">{principle.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-navy-500">{principle.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="font-serif text-xl font-semibold text-navy-900">Cómo nos financiamos</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-navy-700">
            Para mantener el servicio, algunos enlaces hacia tiendas son
            enlaces de afiliado: si compras a través de ellos, podemos
            recibir una pequeña comisión, sin coste adicional para ti. Esa
            comisión nunca influye en qué ofertas mostramos, en qué orden
            aparecen ni en qué marcamos como verificado. Puedes leer el
            detalle completo en nuestro{" "}
            <Link
              href="/aviso-afiliacion"
              className="rounded underline decoration-navy-300 underline-offset-2 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
            >
              aviso de afiliación
            </Link>
            .
          </p>
        </section>

        <section className="mt-10">
          <h2 className="font-serif text-xl font-semibold text-navy-900">Cómo funciona</h2>
          <ol className="mt-4 flex flex-col gap-5">
            {steps.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-900 text-sm font-semibold text-white">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-serif text-base font-semibold text-navy-900">{step.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-navy-500">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <nav aria-label="Enlaces relacionados" className="mt-12 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-8">
          <Link
            href="/metodologia"
            className="rounded text-sm font-medium text-teal-700 underline decoration-teal-300 underline-offset-2 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
          >
            Metodología
          </Link>
          <Link
            href="/aviso-afiliacion"
            className="rounded text-sm font-medium text-teal-700 underline decoration-teal-300 underline-offset-2 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
          >
            Aviso de afiliación
          </Link>
          <Link
            href="/guias"
            className="rounded text-sm font-medium text-teal-700 underline decoration-teal-300 underline-offset-2 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
          >
            Guías de compra
          </Link>
        </nav>
      </Container>
    </>
  );
}
