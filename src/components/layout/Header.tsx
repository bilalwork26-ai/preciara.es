"use client";

import Link from "next/link";
import { useState } from "react";
import * as icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Menu, X, Heart, Bell, User } from "lucide-react";
import { Logo } from "@/components/icons/Logo";
import { Container } from "@/components/ui/Container";
import { CategoriesMenu } from "./CategoriesMenu";
import { UtilityButton } from "./UtilityButton";
import { SearchForm } from "@/components/home/SearchForm";
import { demoCategories } from "@/data/demo/categories";

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-navy-900">
      <Container>
        <div className="flex h-16 items-center gap-3 lg:h-20 lg:gap-6">
          <Link href="/" className="shrink-0" aria-label="Preciara — Inicio">
            <Logo theme="light" markClassName="h-8 w-8 shrink-0 lg:h-9 lg:w-9" />
          </Link>

          <CategoriesMenu className="hidden shrink-0 lg:block" />

          <SearchForm id="search-header-desktop" className="hidden min-w-0 flex-1 md:flex" />

          <div className="ml-auto hidden shrink-0 items-center gap-1 lg:flex">
            <UtilityButton
              icon={Heart}
              label="Guardados"
              message="Aquí podrás guardar tus productos y ofertas favoritas en cuanto activemos las cuentas de usuario. Todavía no hay datos guardados."
            />
            <UtilityButton
              icon={Bell}
              label="Alertas"
              message="Las alertas de precio llegarán en una fase posterior: te avisaremos cuando un producto baje al precio que elijas. Aún no está disponible."
            />
            <UtilityButton
              icon={User}
              label="Mi cuenta"
              message="El registro y el inicio de sesión están en construcción. Cuando estén listos, podrás gestionar tu cuenta desde aquí."
              withChevron
            />
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="ml-auto inline-flex items-center justify-center rounded-full p-2 text-ivory lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        <div className="pb-3 md:hidden">
          <SearchForm id="search-header-mobile" />
        </div>
      </Container>

      {open && (
        <div id="mobile-nav" className="border-t border-white/10 bg-navy-900 lg:hidden">
          <Container className="py-4">
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-navy-100">
              Categorías
            </p>
            <ul className="mt-2 grid grid-cols-2 gap-1">
              {demoCategories.map((category) => {
                const Icon = (icons as unknown as Record<string, LucideIcon>)[category.icon] ?? icons.Tag;
                return (
                  <li key={category.id}>
                    <a
                      href={`/buscar?categoria=${category.slug}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-ivory transition-colors hover:bg-white/10"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-crystal" aria-hidden="true" strokeWidth={1.75} />
                      <span className="truncate">{category.name}</span>
                    </a>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 flex flex-col gap-1 border-t border-white/10 pt-4">
              <MobileUtilityDisclosure
                icon={Heart}
                label="Guardados"
                message="Aquí podrás guardar tus productos y ofertas favoritas en cuanto activemos las cuentas de usuario. Todavía no hay datos guardados."
              />
              <MobileUtilityDisclosure
                icon={Bell}
                label="Alertas"
                message="Las alertas de precio llegarán en una fase posterior: te avisaremos cuando un producto baje al precio que elijas. Aún no está disponible."
              />
              <MobileUtilityDisclosure
                icon={User}
                label="Mi cuenta"
                message="El registro y el inicio de sesión están en construcción. Cuando estén listos, podrás gestionar tu cuenta desde aquí."
              />
            </div>
          </Container>
        </div>
      )}
    </header>
  );
}

function MobileUtilityDisclosure({
  icon: Icon,
  label,
  message,
}: {
  icon: LucideIcon;
  label: string;
  message: string;
}) {
  return (
    <details className="group rounded-xl px-1 text-ivory open:bg-white/5">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-2 py-2.5 text-sm font-medium marker:content-none">
        <Icon className="h-4 w-4 shrink-0 text-crystal" aria-hidden="true" strokeWidth={1.75} />
        {label}
      </summary>
      <p className="px-2 pb-3 text-sm leading-relaxed text-navy-100">{message}</p>
    </details>
  );
}
