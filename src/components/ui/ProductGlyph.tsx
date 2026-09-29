"use client";

import { useState } from "react";
import * as icons from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Marcador visual del producto: muestra la foto real (`imageUrl`) cuando
 * existe y carga sin error; si no hay imagen, falla al cargar, o carga
 * "bien" mas resulta en un píxel prácticamente vacío (algunos comercios
 * devuelven un GIF/PNG de 1x1 transparente o de protección anti-hotlink
 * en vez de un 404 real — nunca dispara `onError`, pero se ve como una
 * tarjeta en blanco), cae al icono de categoría sobre un fondo suave.
 *
 * Se usa `<img>` en vez de `next/image`: las imágenes vienen de dominios
 * de comercio arbitrarios (uno distinto por cada anunciante de cada feed
 * de afiliación), así que no hay una lista de dominios fija que se pueda
 * mantener en `images.remotePatterns`.
 */
export function ProductGlyph({
  icon,
  imageUrl,
  alt,
  className,
  iconClassName,
}: {
  icon: string;
  imageUrl?: string | null;
  alt?: string;
  className?: string;
  iconClassName?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const IconComponent = (icons as unknown as Record<string, LucideIcon>)[icon] ?? icons.Package;
  const trimmedImageUrl = imageUrl?.trim();

  if (trimmedImageUrl && !imageFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- dominio externo arbitrario por comercio, ver comentario superior.
      <img
        src={trimmedImageUrl}
        alt={alt ?? ""}
        loading="lazy"
        onError={() => setImageFailed(true)}
        onLoad={(e) => {
          const img = e.currentTarget;
          // Umbral deliberadamente bajo (2px): una foto de producto real
          // nunca es así de pequeña, pero un GIF de seguimiento de 1x1 sí
          // — evita falsos positivos con miniaturas legítimas pequeñas.
          if (img.naturalWidth < 2 || img.naturalHeight < 2) setImageFailed(true);
        }}
        className={`rounded-xl bg-beige object-contain ${className ?? "h-14 w-14"}`}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-xl bg-beige ${className ?? "h-14 w-14"}`}
      aria-hidden="true"
    >
      <IconComponent className={iconClassName ?? "h-6 w-6 text-navy-700"} strokeWidth={1.75} />
    </div>
  );
}
