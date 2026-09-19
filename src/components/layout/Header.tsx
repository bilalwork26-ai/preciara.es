"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, LogIn } from "lucide-react";
import { Logo } from "@/components/icons/Logo";
import { Container } from "@/components/ui/Container";
import { navItems } from "./nav-items";

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-ivory/95 backdrop-blur supports-[backdrop-filter]:bg-ivory/80">
      <Container>
        <div className="flex h-16 items-center justify-between gap-4">
          <Link href="/" className="shrink-0" aria-label="Preciara — Inicio">
            <Logo />
          </Link>

          <nav aria-label="Navegación principal" className="hidden md:block">
            <ul className="flex items-center gap-6">
              {navItems.map((item) => (
                <li key={item.label}>
                  {item.comingSoon ? (
                    <span className="inline-flex items-center gap-1.5 text-sm text-navy-300">
                      {item.label}
                      <span className="rounded-full bg-beige px-2 py-0.5 text-xs font-medium text-navy-500">
                        Próximamente
                      </span>
                    </span>
                  ) : (
                    <Link
                      href={item.href}
                      className="text-sm font-medium text-navy-700 transition-colors hover:text-teal-600"
                    >
                      {item.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="hidden items-center gap-2 rounded-full border border-navy-800 px-4 py-2 text-sm font-medium text-navy-800 transition-colors hover:bg-navy-800 hover:text-ivory sm:inline-flex"
              aria-label="Iniciar sesión (próximamente)"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
              Iniciar sesión
            </button>

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center justify-center rounded-full p-2 text-navy-800 md:hidden"
              aria-expanded={open}
              aria-controls="mobile-nav"
              aria-label={open ? "Cerrar menú" : "Abrir menú"}
            >
              {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </Container>

      {open && (
        <nav id="mobile-nav" aria-label="Navegación principal (móvil)" className="border-t border-border md:hidden">
          <Container>
            <ul className="flex flex-col gap-1 py-3">
              {navItems.map((item) => (
                <li key={item.label}>
                  {item.comingSoon ? (
                    <span className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm text-navy-300">
                      {item.label}
                      <span className="rounded-full bg-beige px-2 py-0.5 text-xs font-medium text-navy-500">
                        Próximamente
                      </span>
                    </span>
                  ) : (
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="block rounded-lg px-3 py-2.5 text-sm font-medium text-navy-700 hover:bg-beige"
                    >
                      {item.label}
                    </Link>
                  )}
                </li>
              ))}
              <li>
                <button
                  type="button"
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-navy-800 px-4 py-2.5 text-sm font-medium text-navy-800"
                >
                  <LogIn className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
                  Iniciar sesión
                </button>
              </li>
            </ul>
          </Container>
        </nav>
      )}
    </header>
  );
}
