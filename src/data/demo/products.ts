import type { Product } from "@/types";

/**
 * DATOS DE DEMOSTRACIÓN
 * ---------------------
 * Todos los precios, descuentos, historiales y disponibilidad de este
 * fichero son ficticios y sirven únicamente para ilustrar el diseño de
 * Preciara durante la Fase 1. No proceden de ninguna tienda ni API real y
 * no deben interpretarse como ofertas verificadas.
 *
 * En la Fase 3, este fichero se sustituirá por datos obtenidos de APIs
 * oficiales o feeds de afiliación autorizados, guardados en las tablas
 * `Product`, `Offer` y `PriceSnapshot`.
 */
export const demoProducts: Product[] = [
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
      { id: "offer-1a", merchantId: "merchant-a", price: 699, previousPrice: 899, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 20 min" },
      { id: "offer-1b", merchantId: "merchant-b", price: 719, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 35 min" },
      { id: "offer-1c", merchantId: "merchant-c", price: 729, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 1 h" },
      { id: "offer-1d", merchantId: "merchant-d", price: 749, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 2 h" },
    ],
  },
  {
    id: "prod-auriculares",
    slug: "auriculares-inalambricos",
    name: "Auriculares inalámbricos",
    categoryId: "cat-tecnologia",
    icon: "Headphones",
    priceHistory: [
      { label: "Ago", date: "2025-08-01", price: 109.99 },
      { label: "Nov", date: "2025-11-01", price: 109.99 },
      { label: "Ene", date: "2026-01-12", price: 79.99 },
    ],
    offers: [
      { id: "offer-2a", merchantId: "merchant-a", price: 79.99, previousPrice: 109.99, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 12 min" },
    ],
  },
  {
    id: "prod-freidora",
    slug: "freidora-de-aire-5-5l",
    name: "Freidora de aire 5,5 L",
    categoryId: "cat-electro",
    icon: "CookingPot",
    priceHistory: [
      { label: "Ago", date: "2025-08-01", price: 89.99 },
      { label: "Nov", date: "2025-11-01", price: 89.99 },
      { label: "Ene", date: "2026-01-12", price: 64.99 },
    ],
    offers: [
      { id: "offer-3a", merchantId: "merchant-b", price: 64.99, previousPrice: 89.99, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 18 min" },
    ],
  },
  {
    id: "prod-aspirador",
    slug: "robot-aspirador",
    name: "Robot aspirador",
    categoryId: "cat-hogar",
    icon: "Bot",
    priceHistory: [
      { label: "Ago", date: "2025-08-01", price: 249 },
      { label: "Nov", date: "2025-11-01", price: 249 },
      { label: "Ene", date: "2026-01-12", price: 189 },
    ],
    offers: [
      { id: "offer-4a", merchantId: "merchant-c", price: 189, previousPrice: 249, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 1 h" },
    ],
  },
  {
    id: "prod-smartwatch",
    slug: "smartwatch-deportivo",
    name: "Smartwatch deportivo",
    categoryId: "cat-deporte",
    icon: "Watch",
    priceHistory: [
      { label: "Ago", date: "2025-08-01", price: 179.99 },
      { label: "Nov", date: "2025-11-01", price: 179.99 },
      { label: "Ene", date: "2026-01-12", price: 129.99 },
    ],
    offers: [
      { id: "offer-5a", merchantId: "merchant-d", price: 129.99, previousPrice: 179.99, currency: "EUR", url: "#", inStock: true, verified: true, lastCheckedLabel: "hace 2 h" },
    ],
  },
];

/** Producto destacado en las tarjetas de historial y comparación de tiendas. */
export const demoFeaturedProduct = demoProducts[0];
