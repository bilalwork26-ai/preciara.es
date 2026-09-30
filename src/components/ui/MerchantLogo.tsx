"use client";

import { useState } from "react";

/**
 * Logo real del comercio (`merchant.logoUrl`) cuando existe y carga sin
 * error; si no hay logo o falla al cargar, cae a un avatar con la
 * inicial del nombre sobre `accentColor` — mismo patrón de fallback que
 * `ProductGlyph` (ver ese fichero), aplicado aquí a comercios en vez de a
 * productos. Ninguna fuente conectada hoy (Awin) aporta `logoUrl` (ver el
 * comentario de `Merchant` en src/types/index.ts), así que en producción
 * este componente renderiza casi siempre el avatar de inicial — queda ya
 * listo para cuando una fuente futura sí lo traiga.
 */
export function MerchantLogo({
  merchant,
  className,
}: {
  merchant: { name: string; accentColor: string; logoUrl?: string | null };
  className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const trimmedLogoUrl = merchant.logoUrl?.trim();

  if (trimmedLogoUrl && !imageFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- dominio externo arbitrario por comercio, mismo motivo que ProductGlyph.
      <img
        src={trimmedLogoUrl}
        alt=""
        loading="lazy"
        onError={() => setImageFailed(true)}
        className={`rounded-md border border-border bg-white object-contain ${className ?? "h-8 w-8"}`}
      />
    );
  }

  const initial = merchant.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      className={`flex items-center justify-center rounded-md text-xs font-bold text-white ${className ?? "h-8 w-8"}`}
      style={{ backgroundColor: merchant.accentColor }}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}
