import { ArrowDown } from "lucide-react";

export function DiscountBadge({
  percent,
  size = "default",
}: {
  percent: number;
  /** "sm" para fotos pequeñas (p. ej. el icono de /categoria y /buscar) donde el tamaño por defecto, pensado para la foto grande de ProductDealCard, desbordaría. */
  size?: "default" | "sm";
}) {
  if (percent <= 0) return null;
  if (size === "sm") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-coral-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
        <ArrowDown className="h-2.5 w-2.5" aria-hidden="true" strokeWidth={2.5} />
        -{percent}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-coral-500 px-2 py-1 text-xs font-bold text-white shadow-sm sm:px-3 sm:py-1.5 sm:text-base">
      <ArrowDown className="h-3 w-3 sm:h-4 sm:w-4" aria-hidden="true" strokeWidth={2.5} />
      -{percent}%
    </span>
  );
}
