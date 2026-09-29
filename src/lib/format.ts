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
 * El descuento real de un producto puede estar en cualquiera de sus
 * ofertas, no necesariamente en la de precio más bajo (dos comercios
 * pueden tener `previousPrice` distinto, o solo uno de ellos lo trae
 * registrado) — mismo criterio que `bestDiscountPercent` en
 * server/dataSource/home.ts (decide qué tarjeta se destaca en portada),
 * aplicado aquí al tipo `Offer` ya convertido para el cliente.
 */
export function bestOfferDiscountPercent(offers: { price: number; previousPrice?: number }[]): number {
  let max = 0;
  for (const offer of offers) {
    if (!offer.previousPrice) continue;
    const percent = calcDiscountPercent(offer.price, offer.previousPrice);
    if (percent > max) max = percent;
  }
  return max;
}

/**
 * Corrige, solo para mostrar (nunca reescribe el dato guardado), un
 * nombre que llega del feed COMPLETAMENTE EN MAYÚSCULAS (p. ej. "BOLSA DE
 * VIAJE FAVORITE"), caso real observado en varios comercios. Un nombre
 * con mayúsculas y minúsculas mezcladas (el caso normal) se deja tal
 * cual: no hay forma fiable de "arreglar" una capitalización que ya es
 * intencional sin arriesgarse a estropear siglas o nombres propios.
 */
function toSentenceCase(text: string): string {
  // Un texto muy corto (p. ej. "L", "XS", "OLED") no dice nada de si el
  // nombre completo viene "gritando" o es una sigla/unidad legítima —
  // solo se corrige cuando hay letras de sobra para distinguir ambos
  // casos con confianza.
  const letterCount = (text.match(/[a-zA-ZÀ-ÿ]/g) ?? []).length;
  if (letterCount < 4) return text;
  if (text !== text.toUpperCase()) return text;
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Corrige, solo para mostrar (nunca reescribe el dato guardado), el caso
 * real observado en el feed de Awin: la marca llega pegada al inicio del
 * nombre sin ningún separador, tal cual la aporta el comercio (p. ej.
 * "adidasPantalón Tastigo 3 Training XS") en `product_name`. Si el nombre
 * ya trae un separador real entre la marca y el resto (espacio, guion,
 * dos puntos...), se deja tal cual — nunca se reformatea dos veces ni se
 * toca un nombre que ya viene bien. También corrige, en cualquiera de los
 * dos casos, un nombre que llega completamente en mayúsculas (ver
 * `toSentenceCase`).
 */
export function formatProductDisplayName(name: string, brand?: string | null): string {
  const trimmedName = name.trim();
  const trimmedBrand = brand?.trim();
  if (!trimmedBrand) return toSentenceCase(trimmedName);
  if (!trimmedName.toLowerCase().startsWith(trimmedBrand.toLowerCase())) return toSentenceCase(trimmedName);

  const rest = trimmedName.slice(trimmedBrand.length);
  if (!rest || /^[\s\-–—:]/.test(rest)) return toSentenceCase(trimmedName); // ya había separador, o el nombre es solo la marca

  const capitalizedBrand = trimmedBrand.charAt(0).toUpperCase() + trimmedBrand.slice(1).toLowerCase();
  return `${capitalizedBrand} - ${toSentenceCase(rest.trim())}`;
}
