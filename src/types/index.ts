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
  /** Logo real del comercio, cuando la fuente lo aporta. Hoy ninguna fuente conectada lo trae (Awin nunca lo expone en su feed de productos — ver awinOrchestrator.ts); `null`/ausente cae a un avatar con la inicial del nombre sobre `accentColor` (ver MerchantLogo.tsx). */
  logoUrl?: string | null;
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
  /**
   * Gastos de envío en EUR, tal como los ingiere el feed — se conserva en
   * el dato aunque ya no se muestre ni se use en ningún cálculo de la UI
   * (ver la ficha de producto, `/producto/[slug]/page.tsx`): "PRECIO" y
   * "Mejor precio" se basan única y exclusivamente en el PVP del
   * producto. `null`/ausente = el comercio o la fuente no lo especifica.
   */
  shippingCost?: number | null;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  /** Nombre de icono de lucide-react usado como imagen ilustrativa (fallback si no hay `imageUrl`). */
  icon: string;
  /** URL de la foto real del producto (feed del proveedor), si existe. */
  imageUrl?: string | null;
  /** Marca del producto (feed del proveedor), si existe. Ver `formatProductDisplayName` en src/lib/format.ts. */
  brand?: string | null;
  priceHistory: PricePoint[];
  offers: Offer[];
}
