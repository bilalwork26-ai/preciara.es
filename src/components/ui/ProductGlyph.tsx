import * as icons from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Marcador visual del producto: un icono de categoría sobre un fondo suave.
 * Se usa mientras no haya fotografías reales de producto, para no simular
 * imágenes de tiendas que no existen.
 */
export function ProductGlyph({ icon, className }: { icon: string; className?: string }) {
  const IconComponent = (icons as unknown as Record<string, LucideIcon>)[icon] ?? icons.Package;
  return (
    <div
      className={`flex items-center justify-center rounded-xl bg-beige ${className ?? "h-14 w-14"}`}
      aria-hidden="true"
    >
      <IconComponent className="h-6 w-6 text-navy-700" strokeWidth={1.75} />
    </div>
  );
}
