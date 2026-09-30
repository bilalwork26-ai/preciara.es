import type { Product } from "@/types";

/**
 * DATOS DE DEMOSTRACIÓN
 * ---------------------
 * Todos los precios, descuentos, historiales y disponibilidad de este
 * fichero son ficticios y sirven únicamente para ilustrar el diseño de
 * Preciara. No proceden de ninguna tienda ni API real, no representan
 * marcas comerciales reales y no deben interpretarse como ofertas
 * verificadas.
 *
 * En la Fase 3, este fichero se sustituirá por datos obtenidos de APIs
 * oficiales o feeds de afiliación autorizados, guardados en las tablas
 * `Product`, `Offer` y `PriceSnapshot`.
 */
export const demoProducts: Product[] = [
  {
    id: "prod-auriculares-pro",
    slug: "auriculares-inalambricos-pro",
    name: "Auriculares inalámbricos Pro",
    categoryId: "cat-tecnologia",
    icon: "Headphones",
    // 12 meses, para el selector 1M / 3M / 6M / 1A del panel de comparación.
    priceHistory: [
      { label: "Feb", date: "2025-02-01", price: 279 },
      { label: "Mar", date: "2025-03-01", price: 279 },
      { label: "Abr", date: "2025-04-01", price: 265 },
      { label: "May", date: "2025-05-01", price: 259 },
      { label: "Jun", date: "2025-06-01", price: 249 },
      { label: "Jul", date: "2025-07-01", price: 245 },
      { label: "Ago", date: "2025-08-01", price: 239 },
      { label: "Sep", date: "2025-09-01", price: 229 },
      { label: "Oct", date: "2025-10-01", price: 219 },
      { label: "Nov", date: "2025-11-01", price: 209 },
      { label: "Dic", date: "2025-12-01", price: 205 },
      { label: "Ene", date: "2026-01-12", price: 199 },
    ],
    offers: [
      { id: "offer-auri-a", merchantId: "merchant-a", price: 199, previousPrice: 279, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 12 min" },
      { id: "offer-auri-b", merchantId: "merchant-b", price: 205.99, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 25 min" },
      { id: "offer-auri-c", merchantId: "merchant-c", price: 219, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 40 min" },
    ],
  },
  {
    id: "prod-smartphone-128",
    slug: "smartphone-128gb",
    name: "Smartphone 128 GB",
    categoryId: "cat-tecnologia",
    icon: "Smartphone",
    priceHistory: [
      { label: "Nov", date: "2025-11-01", price: 449 },
      { label: "Dic", date: "2025-12-01", price: 419 },
      { label: "Ene", date: "2026-01-12", price: 349 },
    ],
    offers: [
      { id: "offer-sp-a", merchantId: "merchant-a", price: 349, previousPrice: 449, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 35 min" },
      { id: "offer-sp-b", merchantId: "merchant-b", price: 369, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 1 h" },
      { id: "offer-sp-c", merchantId: "merchant-c", price: 389, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 2 h" },
    ],
  },
  {
    id: "prod-aspirador",
    slug: "robot-aspirador",
    name: "Robot aspirador",
    categoryId: "cat-hogar",
    icon: "Bot",
    priceHistory: [
      { label: "Nov", date: "2025-11-01", price: 249 },
      { label: "Dic", date: "2025-12-01", price: 249 },
      { label: "Ene", date: "2026-01-12", price: 189 },
    ],
    offers: [
      { id: "offer-asp-a", merchantId: "merchant-a", price: 189, previousPrice: 249, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 1 h" },
      { id: "offer-asp-b", merchantId: "merchant-b", price: 199, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 2 h" },
      { id: "offer-asp-c", merchantId: "merchant-c", price: 214, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 3 h" },
    ],
  },
  {
    id: "prod-consola-oled",
    slug: "consola-portatil-oled",
    name: "Consola portátil OLED",
    categoryId: "cat-infantil",
    icon: "Gamepad2",
    priceHistory: [
      { label: "Nov", date: "2025-11-01", price: 329 },
      { label: "Dic", date: "2025-12-01", price: 299 },
      { label: "Ene", date: "2026-01-12", price: 259 },
    ],
    offers: [
      { id: "offer-consola-a", merchantId: "merchant-a", price: 259, previousPrice: 329, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 2 h" },
      { id: "offer-consola-b", merchantId: "merchant-b", price: 269, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 2 h" },
      { id: "offer-consola-c", merchantId: "merchant-c", price: 289, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 4 h" },
    ],
  },
  {
    id: "prod-zapatillas",
    slug: "zapatillas-urbanas",
    name: "Zapatillas urbanas",
    categoryId: "cat-moda",
    icon: "Footprints",
    priceHistory: [
      { label: "Nov", date: "2025-11-01", price: 79.99 },
      { label: "Dic", date: "2025-12-01", price: 79.99 },
      { label: "Ene", date: "2026-01-12", price: 54.99 },
    ],
    offers: [
      { id: "offer-zap-a", merchantId: "merchant-a", price: 54.99, previousPrice: 79.99, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 3 h" },
      { id: "offer-zap-b", merchantId: "merchant-b", price: 59.99, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 3 h" },
      { id: "offer-zap-c", merchantId: "merchant-c", price: 64.99, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 5 h" },
    ],
  },
  {
    id: "prod-freidora",
    slug: "freidora-de-aire-5-5l",
    name: "Freidora de aire 5,5 L",
    categoryId: "cat-electro",
    icon: "CookingPot",
    priceHistory: [
      { label: "Nov", date: "2025-11-01", price: 89.99 },
      { label: "Dic", date: "2025-12-01", price: 89.99 },
      { label: "Ene", date: "2026-01-12", price: 64.99 },
    ],
    offers: [
      { id: "offer-frei-a", merchantId: "merchant-a", price: 64.99, previousPrice: 89.99, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 18 min" },
      { id: "offer-frei-b", merchantId: "merchant-b", price: 69.99, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 45 min" },
      { id: "offer-frei-c", merchantId: "merchant-c", price: 76.5, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 2 h" },
    ],
  },
  {
    id: "prod-portatil-14",
    slug: "portatil-14-16gb-512gb",
    name: 'Portátil 14" 16 GB / 512 GB',
    categoryId: "cat-tecnologia",
    icon: "Laptop",
    priceHistory: [
      { label: "Ago", date: "2025-08-01", price: 899 },
      { label: "Sep", date: "2025-09-01", price: 869 },
      { label: "Oct", date: "2025-10-01", price: 799 },
      { label: "Nov", date: "2025-11-01", price: 749 },
      { label: "Dic", date: "2025-12-01", price: 679 },
      { label: "Ene", date: "2026-01-12", price: 699 },
    ],
    offers: [
      { id: "offer-port-a", merchantId: "merchant-a", price: 699, previousPrice: 899, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 20 min" },
      { id: "offer-port-b", merchantId: "merchant-b", price: 719, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 35 min" },
      { id: "offer-port-c", merchantId: "merchant-c", price: 729, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 1 h" },
      { id: "offer-port-d", merchantId: "merchant-d", price: 749, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 2 h" },
    ],
  },
  /**
   * "Deporte" ("cat-deporte"), "Salud y cuidado" ("cat-salud") y "Jardín y
   * bricolaje" ("cat-jardin") no tenían ningún producto en `demoProducts`
   * (el catálogo de demostración de `getCategoryDetail`, distinto de
   * `demoSupergangas` más abajo, que sí tiene un producto de "Deporte" pero
   * no es el catálogo que consulta la ficha de categoría): sin BD real
   * conectada para esas categorías, `/categoria/[slug]` devolvía
   * "not-found" (404) en vez del catálogo de demostración que sí sirve
   * cualquier otra categoría. Los nuevos banners de la portada
   * (CategoryBanners.tsx) enlazan a las 8 categorías de la taxonomía,
   * incluidas estas tres, así que necesitan al menos un producto demo
   * propio para no ser enlaces muertos.
   */
  {
    id: "prod-camiseta-running",
    slug: "camiseta-tecnica-running",
    name: "Camiseta técnica running",
    categoryId: "cat-deporte",
    icon: "Shirt",
    priceHistory: [
      { label: "Nov", date: "2025-11-01", price: 34.99 },
      { label: "Dic", date: "2025-12-01", price: 32.99 },
      { label: "Ene", date: "2026-01-12", price: 24.99 },
    ],
    offers: [
      { id: "offer-camiseta-a", merchantId: "merchant-b", price: 24.99, previousPrice: 34.99, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 10 min" },
      { id: "offer-camiseta-b", merchantId: "merchant-d", price: 27.99, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 50 min" },
    ],
  },
  {
    id: "prod-crema-facial-spf",
    slug: "crema-facial-spf-50",
    name: "Crema facial SPF 50",
    categoryId: "cat-salud",
    icon: "HeartPulse",
    priceHistory: [
      { label: "Nov", date: "2025-11-01", price: 24.99 },
      { label: "Dic", date: "2025-12-01", price: 22.99 },
      { label: "Ene", date: "2026-01-12", price: 17.99 },
    ],
    offers: [
      { id: "offer-crema-a", merchantId: "merchant-a", price: 17.99, previousPrice: 24.99, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 18 min" },
      { id: "offer-crema-b", merchantId: "merchant-c", price: 19.99, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 55 min" },
    ],
  },
  {
    id: "prod-taladro-percutor",
    slug: "taladro-percutor-inalambrico",
    name: "Taladro percutor inalámbrico",
    categoryId: "cat-jardin",
    icon: "Hammer",
    priceHistory: [
      { label: "Nov", date: "2025-11-01", price: 119.99 },
      { label: "Dic", date: "2025-12-01", price: 109.99 },
      { label: "Ene", date: "2026-01-12", price: 89.99 },
    ],
    offers: [
      { id: "offer-taladro-a", merchantId: "merchant-d", price: 89.99, previousPrice: 119.99, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 22 min" },
      { id: "offer-taladro-b", merchantId: "merchant-b", price: 94.99, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 1 h" },
    ],
  },
];

/**
 * Productos de la cuadrícula "Bajadas verificadas hoy": los 6 productos de
 * demostración pedidos, incluido el destacado del banner principal (igual
 * que en la referencia, la mejor oferta también aparece en el listado
 * completo). Excluye el portátil, que es el producto del banner secundario.
 */
export const demoDealsGrid = demoProducts.filter((p) => p.id !== "prod-portatil-14");

/** Producto del banner promocional secundario. */
export const demoSecondaryBannerProduct = demoProducts.find((p) => p.id === "prod-portatil-14")!;

/**
 * Productos de demostración exclusivos para "Supergangas": ninguno de
 * `demoProducts` llega al umbral estricto de descuento (≥30%, ver
 * `SUPERGANGAS_MIN_DISCOUNT_PERCENT` en `server/dataSource/home.ts`) salvo
 * uno solo ("Zapatillas urbanas", 31%), así que ese catálogo no basta para
 * ilustrar el bloque con varios chollos de ejemplo. Este bloque, más
 * pequeño y separado, existe únicamente para ese caso — `demoProducts`/
 * `demoDealsGrid` no cambian, así que ningún otro sitio de la web se ve
 * afectado por estos precios.
 */
export const demoSupergangas: Product[] = [
  {
    id: "prod-superganga-auriculares",
    slug: "auriculares-bluetooth-deportivos",
    name: "Auriculares Bluetooth deportivos",
    categoryId: "cat-tecnologia",
    icon: "Headphones",
    priceHistory: [
      { label: "Nov", date: "2025-11-01", price: 89.99 },
      { label: "Dic", date: "2025-12-01", price: 89.99 },
      { label: "Ene", date: "2026-01-12", price: 54.99 },
    ],
    offers: [
      { id: "offer-sg-auri-a", merchantId: "merchant-a", price: 54.99, previousPrice: 89.99, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 10 min" },
      { id: "offer-sg-auri-b", merchantId: "merchant-b", price: 59.99, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 30 min" },
    ],
  },
  {
    id: "prod-superganga-sudadera",
    slug: "sudadera-tecnica-running",
    name: "Sudadera técnica running",
    categoryId: "cat-deporte",
    icon: "Shirt",
    priceHistory: [
      { label: "Nov", date: "2025-11-01", price: 59.99 },
      { label: "Dic", date: "2025-12-01", price: 59.99 },
      { label: "Ene", date: "2026-01-12", price: 39.99 },
    ],
    offers: [
      { id: "offer-sg-sud-a", merchantId: "merchant-b", price: 39.99, previousPrice: 59.99, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 22 min" },
      { id: "offer-sg-sud-b", merchantId: "merchant-c", price: 42.99, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 1 h" },
    ],
  },
  {
    id: "prod-superganga-aspirador",
    slug: "robot-aspirador-compacto",
    name: "Robot aspirador compacto",
    categoryId: "cat-hogar",
    icon: "Bot",
    priceHistory: [
      { label: "Nov", date: "2025-11-01", price: 199 },
      { label: "Dic", date: "2025-12-01", price: 199 },
      { label: "Ene", date: "2026-01-12", price: 129 },
    ],
    offers: [
      { id: "offer-sg-asp-a", merchantId: "merchant-a", price: 129, previousPrice: 199, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 15 min" },
      { id: "offer-sg-asp-b", merchantId: "merchant-c", price: 139, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 50 min" },
    ],
  },
  {
    id: "prod-superganga-freidora",
    slug: "freidora-de-aire-4l",
    name: "Freidora de aire 4 L",
    categoryId: "cat-electro",
    icon: "CookingPot",
    priceHistory: [
      { label: "Nov", date: "2025-11-01", price: 69.99 },
      { label: "Dic", date: "2025-12-01", price: 69.99 },
      { label: "Ene", date: "2026-01-12", price: 44.99 },
    ],
    offers: [
      { id: "offer-sg-frei-a", merchantId: "merchant-d", price: 44.99, previousPrice: 69.99, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 40 min" },
      { id: "offer-sg-frei-b", merchantId: "merchant-b", price: 47.99, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 2 h" },
    ],
  },
  {
    id: "prod-superganga-mochila",
    slug: "mochila-infantil-escolar",
    name: "Mochila infantil escolar",
    categoryId: "cat-infantil",
    icon: "Backpack",
    priceHistory: [
      { label: "Nov", date: "2025-11-01", price: 39.99 },
      { label: "Dic", date: "2025-12-01", price: 39.99 },
      { label: "Ene", date: "2026-01-12", price: 24.99 },
    ],
    offers: [
      { id: "offer-sg-moch-a", merchantId: "merchant-c", price: 24.99, previousPrice: 39.99, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 5 min" },
      { id: "offer-sg-moch-b", merchantId: "merchant-a", price: 27.99, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 1 h" },
    ],
  },
  {
    id: "prod-superganga-zapatillas",
    slug: "zapatillas-running-pro",
    name: "Zapatillas running Pro",
    categoryId: "cat-moda",
    icon: "Footprints",
    priceHistory: [
      { label: "Nov", date: "2025-11-01", price: 79.99 },
      { label: "Dic", date: "2025-12-01", price: 79.99 },
      { label: "Ene", date: "2026-01-12", price: 49.99 },
    ],
    offers: [
      { id: "offer-sg-zap-a", merchantId: "merchant-b", price: 49.99, previousPrice: 79.99, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 12 min" },
      { id: "offer-sg-zap-b", merchantId: "merchant-d", price: 54.99, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 45 min" },
    ],
  },
];
