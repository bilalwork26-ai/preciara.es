/**
 * "Guardados" (favoritos): sin cuentas de usuario todavía (ver
 * `UtilityButton.tsx`/`Header.tsx`), la única forma honesta de guardar
 * algo es en el propio navegador — así que esto vive enteramente en
 * `localStorage`, por pestaña/dispositivo, nunca en el servidor. El
 * corazón de una tarjeta (`ProductDealCard.tsx`) y el desplegable
 * "Guardados" de la cabecera (`SavedMenu.tsx`) leen y escriben la MISMA
 * lista a través de este módulo, para que ambos se mantengan sincronizados
 * al instante dentro de la misma pestaña (el evento `storage` del
 * navegador no se dispara en la pestaña que hizo el cambio, solo en las
 * demás — de ahí el pub/sub propio de abajo).
 *
 * Mismo criterio de robustez que el resto del sitio: nunca lanza. Sin
 * `window` (renderizado en servidor) o con `localStorage` bloqueado/lleno
 * (modo privado, cuota agotada), simplemente se comporta como si no
 * hubiera nada guardado en vez de romper la página.
 */
import { useSyncExternalStore } from "react";
import type { Merchant, Product } from "@/types";
import { formatProductDisplayName } from "@/lib/format";

export type FavoriteProduct = {
  slug: string;
  name: string;
  imageUrl: string | null;
  icon: string;
  price: number;
  merchantName: string | null;
  /** `Date.now()` de cuando se guardó — decide el orden (más reciente primero) en el desplegable. */
  savedAt: number;
};

const STORAGE_KEY = "preciara:favoritos:v1";
// Referencia ÚNICA y estable: useSyncExternalStore exige que getServerSnapshot
// devuelva siempre el MISMO objeto entre llamadas si no ha cambiado nada —
// un array nuevo en cada llamada (p. ej. `[...EMPTY_FAVORITES]`) dispara
// el aviso/bucle de React "getServerSnapshot should be cached".
const EMPTY_FAVORITES: FavoriteProduct[] = [];

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/** `true` si `value` tiene la forma mínima de un `FavoriteProduct` — descarta en silencio cualquier entrada corrupta de una versión anterior en vez de romper toda la lista por una sola fila inválida. */
function isFavoriteProduct(value: unknown): value is FavoriteProduct {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.slug === "string" && typeof v.name === "string" && typeof v.icon === "string" && typeof v.price === "number";
}

function safeReadAll(): FavoriteProduct[] {
  if (!isBrowser()) return EMPTY_FAVORITES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isFavoriteProduct);
  } catch {
    return [];
  }
}

// --- Lógica pura (sin localStorage/DOM), fácil de probar sin entorno de navegador. ---

/** Añade `product` al principio de `list` (más reciente primero); si ya estaba, no lo duplica, solo lo mueve arriba con la fecha nueva. */
export function upsertFavorite(list: readonly FavoriteProduct[], product: FavoriteProduct): FavoriteProduct[] {
  return [product, ...list.filter((f) => f.slug !== product.slug)];
}

export function withoutFavorite(list: readonly FavoriteProduct[], slug: string): FavoriteProduct[] {
  return list.filter((f) => f.slug !== slug);
}

export function hasFavorite(list: readonly FavoriteProduct[], slug: string): boolean {
  return list.some((f) => f.slug === slug);
}

// --- Estado compartido en memoria + persistencia + pub/sub. ---

let cache: FavoriteProduct[] = safeReadAll();
const listeners = new Set<() => void>();

function persist(next: FavoriteProduct[]) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage bloqueado (modo privado) o cuota agotada: el estado en
    // memoria (`cache`) sigue funcionando para el resto de esta sesión de
    // pestaña, simplemente no sobrevive a un recargado.
  }
}

function commit(next: FavoriteProduct[]) {
  cache = next;
  persist(next);
  listeners.forEach((listener) => listener());
}

if (isBrowser()) {
  // Mantiene sincronizadas varias pestañas abiertas a la vez.
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    cache = safeReadAll();
    listeners.forEach((listener) => listener());
  });
}

export function subscribeFavorites(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getFavoritesSnapshot(): FavoriteProduct[] {
  return cache;
}

export function getFavoritesServerSnapshot(): FavoriteProduct[] {
  return EMPTY_FAVORITES;
}

export function isFavoriteSlug(slug: string): boolean {
  return hasFavorite(cache, slug);
}

/** Guarda o quita `product` de favoritos según su estado actual. Devuelve el nuevo estado (`true` = ahora guardado). */
export function toggleFavorite(product: FavoriteProduct): boolean {
  if (hasFavorite(cache, product.slug)) {
    commit(withoutFavorite(cache, product.slug));
    return false;
  }
  commit(upsertFavorite(cache, { ...product, savedAt: Date.now() }));
  return true;
}

export function removeFavorite(slug: string): void {
  commit(withoutFavorite(cache, slug));
}

// --- Hooks de React sobre el estado de arriba, vía useSyncExternalStore: ---
// misma solución que React recomienda para un store externo (aquí,
// localStorage + la caché en memoria) compartido entre varios componentes
// sin necesidad de envolver la app en un Context/Provider propio, y sin
// desajuste de hidratación (el snapshot de servidor es siempre "vacío").

/** Lista completa de favoritos, reactiva: se usa en el desplegable "Guardados". */
export function useFavorites(): FavoriteProduct[] {
  return useSyncExternalStore(subscribeFavorites, getFavoritesSnapshot, getFavoritesServerSnapshot);
}

/** Si `slug` está guardado, reactivo: se usa en el corazón de cada tarjeta (más barato que releer la lista entera en cada tarjeta). */
export function useIsFavorite(slug: string): boolean {
  return useSyncExternalStore(
    subscribeFavorites,
    () => isFavoriteSlug(slug),
    () => false
  );
}

/**
 * Construye el `FavoriteProduct` a guardar a partir de lo que ya tiene
 * cada tarjeta (mismo criterio de "mejor oferta = precio más bajo" que
 * `ProductDealCard.tsx`) — así el corazón nunca necesita volver a pedir
 * datos, solo transforma lo que ya tiene en pantalla.
 */
export function toFavoriteProduct(product: Product, merchants: Merchant[]): FavoriteProduct {
  const best = [...product.offers].sort((a, b) => a.price - b.price)[0];
  const merchant = merchants.find((m) => m.id === best?.merchantId);
  return {
    slug: product.slug,
    name: formatProductDisplayName(product.name, product.brand),
    imageUrl: product.imageUrl ?? null,
    icon: product.icon,
    price: best?.price ?? 0,
    merchantName: merchant?.name ?? null,
    savedAt: Date.now(),
  };
}
