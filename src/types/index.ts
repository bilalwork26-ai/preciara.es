/**
 * Tipos del dominio de Preciara.
 *
 * Reflejan las entidades previstas para la base de datos (Fase 2: Category,
 * Product, Merchant, Offer, PriceSnapshot, SyncRun). En la Fase 1 no hay
 * base de datos: estos tipos describen los datos de demostración en
 * `src/data/demo` y se reutilizarán como base del esquema de Prisma.
 */

export interface Category {
  id: string;
  slug: string;
  name: string;
  /** Nombre de icono de lucide-react, p. ej. "Laptop". */
  icon: string;
}

export interface Merchant {
  id: string;
  slug: string;
  name: string;
  /** Color de acento de marca para distinguir tiendas en tablas comparativas. */
  accentColor: string;
}

export interface PricePoint {
  /** Etiqueta corta de fecha, p. ej. "Ago", "12 ene". */
  label: string;
  /** Fecha ISO completa, usada para orden y metadatos. */
  date: string;
  price: number;
}

export interface Offer {
  id: string;
  merchantId: string;
  price: number;
  previousPrice?: number;
  currency: "EUR";
  /** URL de destino (demo). En producción será un enlace de afiliado. */
  url: string;
  inStock: boolean;
  /** Verificado = el precio se comprobó dentro del periodo de frescura definido. */
  verified: boolean;
  /** Etiqueta legible de cuándo se comprobó por última vez (dato de demo). */
  lastCheckedLabel: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  /** Nombre de icono de lucide-react usado como imagen ilustrativa. */
  icon: string;
  priceHistory: PricePoint[];
  offers: Offer[];
}
