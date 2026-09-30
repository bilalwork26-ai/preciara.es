"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Heart, X } from "lucide-react";
import { useFavorites, removeFavorite } from "@/lib/favorites";
import { formatPrice } from "@/lib/format";
import { ProductGlyph } from "@/components/ui/ProductGlyph";

/**
 * Versión real de "Guardados" en la cabecera (sustituye al antiguo
 * `UtilityButton` de mensaje "todavía no hay datos guardados", que era
 * siempre cierto porque el corazón de las tarjetas no guardaba nada de
 * verdad — ver `ProductDealCard.tsx`/`src/lib/favorites.ts`). Misma
 * mecánica de panel accesible (click fuera/Escape cierra) que el resto de
 * botones de la cabecera, pero con contenido real: la lista de favoritos
 * de este navegador, con enlace a cada producto y opción de quitarlo.
 */
export function SavedMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const favorites = useFavorites();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="utility-panel-guardados"
        className="flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-ivory transition-colors hover:bg-white/10"
      >
        <Heart className="h-5 w-5" aria-hidden="true" strokeWidth={1.75} />
        <span className="text-[11px] font-medium leading-none">Guardados{favorites.length > 0 ? ` (${favorites.length})` : ""}</span>
      </button>

      {open && (
        <div
          id="utility-panel-guardados"
          role="dialog"
          aria-label="Guardados"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-80 rounded-2xl border border-border bg-white p-4 text-navy-900 shadow-lg"
        >
          <p className="text-sm font-semibold">Guardados</p>
          {favorites.length === 0 ? (
            <p className="mt-1.5 text-sm leading-relaxed text-navy-500">
              Todavía no has guardado ningún producto. Pulsa el corazón de una tarjeta para añadirlo aquí.
            </p>
          ) : (
            <ul className="mt-2 flex max-h-80 flex-col gap-1 overflow-y-auto">
              {favorites.map((favorite) => (
                <li key={favorite.slug} className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-beige/60">
                  <Link
                    href={`/producto/${favorite.slug}`}
                    onClick={() => setOpen(false)}
                    className="flex min-w-0 flex-1 items-center gap-2"
                  >
                    <ProductGlyph icon={favorite.icon} imageUrl={favorite.imageUrl} alt={favorite.name} className="h-10 w-10 shrink-0 rounded-lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-navy-900">{favorite.name}</span>
                      <span className="block text-xs text-navy-500">
                        {formatPrice(favorite.price)}
                        {favorite.merchantName ? ` · ${favorite.merchantName}` : ""}
                      </span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => removeFavorite(favorite.slug)}
                    aria-label={`Quitar ${favorite.name} de guardados`}
                    className="shrink-0 rounded-full p-1.5 text-navy-400 transition-colors hover:bg-coral-50 hover:text-coral-600"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Equivalente para el menú móvil de la cabecera (`<details>`, mismo
 * patrón que `MobileUtilityDisclosure` en Header.tsx) — contenido real en
 * vez del mensaje "todavía no hay datos guardados".
 */
export function MobileSavedDisclosure() {
  const favorites = useFavorites();

  return (
    <details className="group rounded-xl px-1 text-ivory open:bg-white/5">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-2 py-2.5 text-sm font-medium marker:content-none">
        <Heart className="h-4 w-4 shrink-0 text-crystal" aria-hidden="true" strokeWidth={1.75} />
        Guardados{favorites.length > 0 ? ` (${favorites.length})` : ""}
      </summary>
      <div className="px-2 pb-3">
        {favorites.length === 0 ? (
          <p className="text-sm leading-relaxed text-navy-100">
            Todavía no has guardado ningún producto. Pulsa el corazón de una tarjeta para añadirlo aquí.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {favorites.map((favorite) => (
              <li key={favorite.slug} className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-white/10">
                <Link href={`/producto/${favorite.slug}`} className="flex min-w-0 flex-1 items-center gap-2">
                  <ProductGlyph icon={favorite.icon} imageUrl={favorite.imageUrl} alt={favorite.name} className="h-9 w-9 shrink-0 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ivory">{favorite.name}</span>
                    <span className="block text-xs text-navy-100">{formatPrice(favorite.price)}</span>
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => removeFavorite(favorite.slug)}
                  aria-label={`Quitar ${favorite.name} de guardados`}
                  className="shrink-0 rounded-full p-1.5 text-navy-100 transition-colors hover:bg-white/10 hover:text-coral-300"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
