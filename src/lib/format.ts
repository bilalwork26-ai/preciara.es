const currencyFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});

export function formatPrice(value: number): string {
  return currencyFormatter.format(value);
}

export function calcDiscountPercent(current: number, previous: number): number {
  if (previous <= 0 || current >= previous) return 0;
  return Math.round(((previous - current) / previous) * 100);
}

/**
 * Corrige, solo para mostrar (nunca reescribe el dato guardado), el caso
 * real observado en el feed de Awin: la marca llega pegada al inicio del
 * nombre sin ningún separador, tal cual la aporta el comercio (p. ej.
 * "adidasPantalón Tastigo 3 Training XS") en `product_name`. Si el nombre
 * ya trae un separador real entre la marca y el resto (espacio, guion,
 * dos puntos...), se deja tal cual — nunca se reformatea dos veces ni se
 * toca un nombre que ya viene bien.
 */
export function formatProductDisplayName(name: string, brand?: string | null): string {
  const trimmedName = name.trim();
  const trimmedBrand = brand?.trim();
  if (!trimmedBrand) return trimmedName;
  if (!trimmedName.toLowerCase().startsWith(trimmedBrand.toLowerCase())) return trimmedName;

  const rest = trimmedName.slice(trimmedBrand.length);
  if (!rest || /^[\s\-–—:]/.test(rest)) return trimmedName; // ya había separador, o el nombre es solo la marca

  const capitalizedBrand = trimmedBrand.charAt(0).toUpperCase() + trimmedBrand.slice(1).toLowerCase();
  return `${capitalizedBrand} - ${rest.trim()}`;
}
