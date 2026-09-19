export type NavItem = {
  label: string;
  href: string;
  comingSoon?: boolean;
};

/**
 * Navegación principal. "Categorías", "Ofertas" y "Comparadores" enlazan a
 * las secciones correspondientes de la página principal (aún no existen
 * páginas propias). "Alertas" y "Blog" están previstas para fases
 * posteriores y se muestran marcadas como próximamente.
 */
export const navItems: NavItem[] = [
  { label: "Categorías", href: "/#categorias" },
  { label: "Ofertas", href: "/#bajadas-verificadas" },
  { label: "Comparadores", href: "/#comparar-tiendas" },
  { label: "Alertas", href: "/#alertas", comingSoon: true },
  { label: "Blog", href: "/#blog", comingSoon: true },
];
