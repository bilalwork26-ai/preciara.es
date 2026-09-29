import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Database, Layers, Link2, ShieldCheck, Store } from "lucide-react";
import { buildBreadcrumbList, buildWebPageJsonLd, DEFAULT_OG_IMAGE_PATH } from "@/lib/seo";
import { serializeJsonLd } from "@/lib/jsonLd";
import { Container } from "@/components/ui/Container";

const title = "Para tiendas";
const description =
  "Cómo integrar tu catálogo en Preciara mediante feeds autorizados: qué respetamos, qué comercios encajan y cuál es el proceso de colaboración.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/para-tiendas" },
  openGraph: { title, description, type: "website", images: [DEFAULT_OG_IMAGE_PATH] },
  twitter: { card: "summary_large_image", title, description, images: [DEFAULT_OG_IMAGE_PATH] },
};

const respectItems = [
  "Los precios que indica tu feed, sin recalcularlos ni mostrar un precio de referencia distinto.",
  "El nombre y la marca de tu tienda, tal como los proporcionas.",
  "La disponibilidad de cada producto, para no dirigir tráfico hacia algo agotado.",
  "Las condiciones de envío, devolución y garantía que tú definas.",
];

const collaborationSteps = [
  {
    title: "Aprobación del programa de afiliación",
    body: "Tu tienda aprueba a Preciara dentro del programa de afiliación correspondiente (por ejemplo, en Awin).",
  },
  {
    title: "Acceso al feed autorizado",
    body: "Con esa aprobación, accedemos al feed de productos que ya proporcionas a través de la red de afiliación.",
  },
  {
    title: "Validación e importación",
    body: "Revisamos el formato del feed y lo importamos, comprobando que los datos esenciales (precio, disponibilidad, enlace) sean válidos.",
  },
  {
    title: "Actualización periódica",
    body: "Volvemos a consultar tu feed de forma periódica para mantener precios y disponibilidad al día.",
  },
];

/**
 * Página orientada a anunciantes/responsables de afiliación. Nunca
 * promete ventas, posicionamiento ni volumen de tráfico — Preciara es un
 * comparador de reciente lanzamiento, así que solo se explica el
 * funcionamiento real (feeds autorizados, enlaces directos a la tienda).
 */
export default function ParaTiendasPage() {
  const breadcrumbJsonLd = buildBreadcrumbList([
    { name: "Inicio", path: "/" },
    { name: "Para tiendas", path: "/para-tiendas" },
  ]);
  const webPageJsonLd = buildWebPageJsonLd({ name: title, description }, "/para-tiendas");

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(webPageJsonLd) }} />

      <section className="bg-navy-900">
        <Container className="py-12 sm:py-16">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-crystal px-3 py-1 text-xs font-semibold tracking-wide text-crystal">
            <Store className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            PARA TIENDAS
          </span>

          <h1 className="mt-4 max-w-2xl font-serif text-3xl font-bold leading-[1.1] text-white sm:text-4xl lg:text-5xl">
            Lleva tu catálogo a compradores que están comparando precios.
          </h1>

          <p className="mt-4 max-w-2xl text-sm text-navy-100 sm:text-base">
            Preciara es un comparador de precios español que acaba de
            empezar. Si gestionas un programa de afiliación o el catálogo de
            una tienda, aquí explicamos cómo funciona la integración, sin
            promesas que no podamos cumplir.
          </p>
        </Container>
      </section>

      <Container className="max-w-3xl py-12 sm:py-16">
        <section>
          <h2 className="font-serif text-xl font-semibold text-navy-900">Qué es Preciara</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-navy-700">
            Preciara compara precios de productos entre tiendas españolas.
            No vendemos ni gestionamos pedidos: mostramos tu oferta junto a
            otras del mismo producto y, cuando alguien hace clic, lo
            llevamos directamente a tu tienda para completar la compra allí.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="font-serif text-xl font-semibold text-navy-900">Cómo se integran los catálogos</h2>
          <div className="mt-3 flex items-start gap-3 rounded-2xl border border-border bg-white p-5">
            <Layers className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" aria-hidden="true" strokeWidth={1.75} />
            <p className="text-[15px] leading-relaxed text-navy-700">
              Importamos tu catálogo mediante feeds autorizados: los que ya
              proporcionas a través de una red de afiliación (como Awin) u
              otras fuentes expresamente permitidas por tu tienda. Nunca
              extraemos datos mediante scraping sin confirmar antes que está
              permitido.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-serif text-xl font-semibold text-navy-900">Cómo funcionan los enlaces</h2>
          <div className="mt-3 flex items-start gap-3 rounded-2xl border border-border bg-white p-5">
            <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" aria-hidden="true" strokeWidth={1.75} />
            <p className="text-[15px] leading-relaxed text-navy-700">
              Cada enlace de oferta lleva al usuario directamente a tu
              tienda para completar la compra: Preciara no intermedia el
              pago ni el pedido. Cuando el enlace es de afiliado, lo
              identificamos como tal de forma técnica y visible, tal como
              explicamos en nuestro aviso de afiliación.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-serif text-xl font-semibold text-navy-900">Qué respetamos siempre</h2>
          <ul className="mt-3 flex flex-col gap-2.5 rounded-2xl border border-border bg-white p-5">
            {respectItems.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-navy-700">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="font-serif text-xl font-semibold text-navy-900">Qué tipo de comercios pueden encajar</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-navy-700">
            Trabajamos con categorías de consumo generalistas: tecnología,
            hogar, electrodomésticos, moda, deporte y similares, entre
            otras. Si tu tienda encaja en alguna de estas categorías y
            dispone de un feed de productos autorizado, tiene sentido hablar.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="font-serif text-xl font-semibold text-navy-900">Proceso de colaboración</h2>
          <ol className="mt-4 flex flex-col gap-5">
            {collaborationSteps.map((step, index) => (
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

        <div className="mt-10 flex items-start gap-3 rounded-2xl border border-border bg-ivory p-5">
          <Database className="mt-0.5 h-5 w-5 shrink-0 text-navy-500" aria-hidden="true" strokeWidth={1.75} />
          <p className="text-sm leading-relaxed text-navy-700">
            Preciara es un comparador de reciente lanzamiento: no prometemos
            un volumen de ventas, una posición concreta ni un nivel de
            tráfico. Lo que sí ofrecemos es un catálogo bien integrado, con
            tus condiciones respetadas.
          </p>
        </div>

        <div className="mt-10 border-t border-border pt-8">
          <Link
            href="/contacto"
            className="inline-flex w-fit items-center gap-2 rounded-full bg-teal-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
          >
            Hablar con Preciara
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </Container>
    </>
  );
}
