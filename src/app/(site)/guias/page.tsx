import type { Metadata } from "next";
import Link from "next/link";
import * as icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BookOpen, Clock, ArrowRight } from "lucide-react";
import { guides } from "@/data/guides";
import { buildBreadcrumbList } from "@/lib/seo";
import { serializeJsonLd } from "@/lib/jsonLd";
import { Container } from "@/components/ui/Container";

const title = "Guías de compra";
const description =
  "Guías prácticas de Preciara para comparar precios, elegir tecnología reacondicionada y comprar electrodomésticos con criterio.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/guias" },
  openGraph: { title, description, type: "website" },
  twitter: { card: "summary", title, description },
};

/**
 * Índice de "Guías de compra": contenido editorial propio de Preciara,
 * nunca catálogo ni ofertas — pensado para dar utilidad y SEO mientras se
 * espera la aprobación de los primeros anunciantes de Awin. Hero navy
 * integrado con el resto del sitio (mismo patrón que Hero.tsx: sección
 * `bg-navy-900` de ancho completo, contenido alineado con `Container`),
 * seguido de tres tarjetas editoriales sobre fondo claro.
 */
export default function GuiasPage() {
  const breadcrumbJsonLd = buildBreadcrumbList([
    { name: "Inicio", path: "/" },
    { name: "Guías de compra", path: "/guias" },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />

      <section className="bg-navy-900">
        <Container className="py-12 sm:py-16">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-crystal px-3 py-1 text-xs font-semibold tracking-wide text-crystal">
            <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            GUÍAS DE PRECIARA
          </span>

          <h1 className="mt-4 max-w-2xl font-serif text-3xl font-bold leading-[1.1] text-white sm:text-4xl lg:text-5xl">
            Comprar mejor también es saber qué comparar.
          </h1>

          <p className="mt-4 max-w-2xl text-sm text-navy-100 sm:text-base">
            Antes de fijarte solo en el precio, hay preguntas que merece la
            pena hacerse: si es el mismo producto, si el descuento es real, si
            conviene esperar. Estas guías reúnen lo esencial para comparar con
            criterio, sin depender de una sola oferta.
          </p>
        </Container>
      </section>

      <Container className="py-12 sm:py-16">
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {guides.map((guide) => {
            const Icon = (icons as unknown as Record<string, LucideIcon>)[guide.icon] ?? icons.BookOpen;
            return (
              <li key={guide.slug}>
                <Link
                  href={`/guias/${guide.slug}`}
                  className="flex h-full flex-col rounded-2xl border border-border bg-white p-6 shadow-sm transition-colors hover:border-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50">
                    <Icon className="h-5 w-5 text-teal-700" aria-hidden="true" strokeWidth={1.75} />
                  </div>

                  <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-teal-700">{guide.category}</p>
                  <h2 className="mt-1 font-serif text-lg font-semibold text-navy-900">{guide.title}</h2>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-navy-500">{guide.description}</p>

                  <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                    <span className="inline-flex items-center gap-1.5 text-xs text-navy-300">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      {guide.readingTime}
                    </span>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-coral-600">
                      Leer guía
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </Container>
    </>
  );
}
