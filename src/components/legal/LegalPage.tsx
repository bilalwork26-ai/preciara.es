import type { ReactNode } from "react";
import { Container } from "@/components/ui/Container";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <Container className="max-w-3xl py-12">
      <h1 className="font-serif text-3xl font-semibold text-navy-900">{title}</h1>
      <p className="mt-2 text-sm text-navy-300">Última actualización: {updated}</p>
      <div className="prose-legal mt-8 flex flex-col gap-5 text-[15px] leading-relaxed text-navy-700">
        {children}
      </div>
    </Container>
  );
}
