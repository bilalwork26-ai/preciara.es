import type { Merchant } from "@/types";

/**
 * DATOS DE DEMOSTRACIÓN — tiendas ficticias para ilustrar la comparativa.
 * No representan comercios reales. Se sustituirán por tiendas y proveedores
 * de afiliación autorizados en la Fase 3.
 */
export const demoMerchants: Merchant[] = [
  { id: "merchant-a", slug: "tienda-demo-a", name: "Tienda Demo A", accentColor: "var(--color-teal-600)" },
  { id: "merchant-b", slug: "tienda-demo-b", name: "Tienda Demo B", accentColor: "var(--color-navy-500)" },
  { id: "merchant-c", slug: "tienda-demo-c", name: "Tienda Demo C", accentColor: "var(--color-navy-500)" },
  { id: "merchant-d", slug: "tienda-demo-d", name: "Tienda Demo D", accentColor: "var(--color-navy-500)" },
];
