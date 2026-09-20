import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/server/admin/auth";

export const metadata = {
  robots: { index: false, follow: false },
};

const NAV_LINKS = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/productos", label: "Productos" },
  { href: "/admin/comercios", label: "Comercios" },
  { href: "/admin/ofertas", label: "Ofertas" },
  { href: "/admin/importaciones", label: "Importaciones" },
  { href: "/admin/errores", label: "Errores" },
  { href: "/admin/importar", label: "Importar CSV" },
];

async function logout() {
  "use server";
  const store = await cookies();
  store.delete(ADMIN_SESSION_COOKIE);
  redirect("/admin/login");
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const store = await cookies();
  const authenticated = verifySessionToken(store.get(ADMIN_SESSION_COOKIE)?.value);

  // La página de login gestiona su propio layout (pantalla completa, sin nav).
  if (!authenticated) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-beige/40">
      <header className="border-b border-border bg-navy-900">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/admin" className="font-serif text-lg font-bold text-white">
            Preciara · Panel técnico
          </Link>
          <nav className="flex flex-1 flex-wrap gap-x-4 gap-y-1 text-sm">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="text-navy-100 transition-colors hover:text-white">
                {link.label}
              </Link>
            ))}
          </nav>
          <form action={logout}>
            <button type="submit" className="text-sm text-navy-100 underline-offset-2 hover:text-white hover:underline">
              Cerrar sesión
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
