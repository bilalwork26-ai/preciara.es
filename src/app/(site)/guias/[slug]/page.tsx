import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { guides, getGuideBySlug } from "@/data/guides";
import { buildArticleJsonLd, buildBreadcrumbList } from "@/lib/seo";
import { serializeJsonLd } from "@/lib/jsonLd";
import { Container } from "@/components/ui/Container";

/**
 * Genera las tres rutas de guía en build (contenido estático, no depende
 * de la base de datos). Un slug fuera de esta lista sigue devolviendo un
 * 404 real vía `notFound()` abajo, nunca un error sin controlar.
 */
export function generateStaticParams() {
  return guides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: PageProps<"/guias/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);
  if (!guide) return {};

  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: `/guias/${guide.slug}` },
    openGraph: { title: guide.title, description: guide.description, type: "article" },
    twitter: { card: "summary", title: guide.title, description: guide.description },
  };
}

export default async function GuidePage({ params }: PageProps<"/guias/[slug]">) {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);
  if (!guide) notFound();

  const breadcrumbJsonLd = buildBreadcrumbList([
    { name: "Inicio", path: "/" },
    { name: "Guías de compra", path: "/guias" },
    { name: guide.title, path: `/guias/${guide.slug}` },
  ]);
  const articleJsonLd = buildArticleJsonLd(
    { headline: guide.title, description: guide.description },
    `/guias/${guide.slug}`,
  );

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(articleJsonLd) }} />

      <Container className="max-w-3xl py-10 sm:py-12">
        <Link
          href="/guias"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-500 transition-colors hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver a todas las guías
        </Link>

        <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-teal-700">{guide.category}</p>
        <h1 className="mt-2 font-serif text-2xl font-bold leading-tight text-navy-900 sm:text-3xl">{guide.title}</h1>
        <p className="mt-3 text-base leading-relaxed text-navy-500">{guide.description}</p>

        <div className="mt-4 inline-flex items-center gap-1.5 text-xs text-navy-300">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {guide.readingTime}
        </div>

        <p className="mt-8 text-base leading-relaxed text-navy-700">{guide.intro}</p>

        <div className="mt-8 flex flex-col gap-8">
          {guide.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-serif text-lg font-semibold text-navy-900">{section.heading}</h2>
              <div className="mt-2 flex flex-col gap-3">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="text-[15px] leading-relaxed text-navy-700">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        {guide.checklist && (
          <div className="mt-10 rounded-2xl border border-border bg-ivory p-6">
            <h2 className="font-serif text-lg font-semibold text-navy-900">Antes de comprar, comprueba:</h2>
            <ul className="mt-3 flex flex-col gap-2.5">
              {guide.checklist.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-navy-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-10 border-t border-border pt-8">
          <Link
            href={guide.relatedHref}
            className="inline-flex w-fit items-center gap-2 rounded-full bg-teal-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
          >
            {guide.relatedLabel}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </Container>
    </>
  );
}
