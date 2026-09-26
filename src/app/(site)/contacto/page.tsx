import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock, Mail } from "lucide-react";
import { getContactEmail } from "@/lib/contact";
import { buildBreadcrumbList, buildContactPageJsonLd } from "@/lib/seo";
import { serializeJsonLd } from "@/lib/jsonLd";
import { Container } from "@/components/ui/Container";

const title = "Contacto";
const description = "Cómo ponerte en contacto con Preciara, si tienes una pregunta, una sugerencia o gestionas el catálogo de una tienda.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/contacto" },
  openGraph: { title, description, type: "website" },
  twitter: { card: "summary", title, description },
};

/**
 * `NEXT_PUBLIC_CONTACT_EMAIL` es opcional (ver src/lib/contact.ts): sin un
 * valor válido configurado, esta página nunca muestra un enlace `mailto:`
 * roto ni un correo inventado — muestra un estado "en preparación"
 * honesto en su lugar. Preciara acaba de empezar: es una situación real,
 * no un error a esconder.
 */
export default function ContactoPage() {
  const email = getContactEmail();

  const breadcrumbJsonLd = buildBreadcrumbList([
    { name: "Inicio", path: "/" },
    { name: "Contacto", path: "/contacto" },
  ]);
  const contactPageJsonLd = buildContactPageJsonLd({ name: title, description, email }, "/contacto");

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(contactPageJsonLd) }} />

      <Container className="max-w-3xl py-12 sm:py-16">
        <h1 className="font-serif text-3xl font-bold text-navy-900">Contacto</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-navy-700">
          ¿Tienes una pregunta, una sugerencia, o gestionas el catálogo o el
          programa de afiliación de una tienda? Aquí tienes cómo escribirnos.
        </p>

        <div className="mt-8 rounded-2xl border border-border bg-white p-6 sm:p-8">
          {email ? (
            <>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50">
                <Mail className="h-5 w-5 text-teal-700" aria-hidden="true" strokeWidth={1.75} />
              </div>
              <h2 className="mt-4 font-serif text-lg font-semibold text-navy-900">Escríbenos por correo</h2>
              <p className="mt-2 text-sm leading-relaxed text-navy-500">Respondemos lo antes posible, normalmente en días laborables.</p>

              <p className="mt-4 text-base font-medium text-navy-900">
                <a
                  href={`mailto:${email}`}
                  className="rounded underline decoration-teal-300 underline-offset-2 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
                >
                  {email}
                </a>
              </p>

              <a
                href={`mailto:${email}`}
                aria-label={`Enviar un correo a ${email}`}
                className="mt-4 inline-flex w-fit items-center gap-2 rounded-full bg-teal-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
              >
                Enviar un correo
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </>
          ) : (
            <>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-beige">
                <Clock className="h-5 w-5 text-navy-500" aria-hidden="true" strokeWidth={1.75} />
              </div>
              <h2 className="mt-4 font-serif text-lg font-semibold text-navy-900">Canal directo en preparación</h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-navy-500">
                Todavía no hemos publicado un correo de contacto directo.
                Mientras lo preparamos, puedes consultar nuestra metodología
                o el aviso de afiliación para resolver dudas frecuentes, o
                visitar la página para tiendas si gestionas un catálogo.
              </p>
            </>
          )}
        </div>

        <nav aria-label="Enlaces relacionados" className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
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
            href="/para-tiendas"
            className="rounded text-sm font-medium text-teal-700 underline decoration-teal-300 underline-offset-2 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
          >
            Para tiendas
          </Link>
        </nav>
      </Container>
    </>
  );
}
