/**
 * Clasificación de un producto en subcategorías visuales (pestañas de
 * filtrado dentro de `/categoria/[slug]`) a partir de su nombre —
 * lógica pura, sin React ni DOM, mismo patrón (y misma cautela) que
 * `categoryMapping.ts`: por palabras clave, conservadora, nunca lanza,
 * siempre determinista, y con un último tramo SIN palabras clave que
 * actúa de comodín (nunca deja un producto sin subcategoría).
 *
 * A diferencia de `categoryMapping.ts` (clasifica el texto de categoría
 * del FEED en la taxonomía real de Preciara, y se guarda), esto nunca se
 * guarda ni se sincroniza: es puramente de presentación, calculado en
 * cada render a partir del nombre ya visible del producto — por eso vive
 * en `src/lib`, no en `src/server/catalogSync`.
 *
 * Cada categoría principal que admite pestañas de subcategoría tiene su
 * propia taxonomía (lista de reglas en orden, más específico primero);
 * las categorías sin taxonomía definida aquí (tecnología, electrodomésticos...)
 * simplemente no muestran pestañas — ver `getSubcategoryTaxonomy`.
 */

export type ProductTypeSlug =
  | "zapatillas"
  | "camisetas-sudaderas"
  | "chaquetas"
  | "pantalones"
  | "accesorios"
  | "climatizacion"
  | "herramientas"
  | "hogar-jardin";

export type SubcategoryRule = {
  slug: ProductTypeSlug;
  label: string;
  /** Ausente = comodín: la última regla de cada taxonomía, sin palabras clave, capta todo lo que ninguna regla anterior haya reconocido. */
  keywords?: readonly string[];
};

/**
 * Moda y Deporte comparten la misma taxonomía de prenda/calzado: el tipo
 * de producto (zapatilla, chaqueta...) no depende de si la tienda lo
 * etiquetó como ropa "de calle" o "deportiva", esa distinción ya la
 * resuelve `categoryMapping.ts` antes de llegar aquí.
 */
const MODA_DEPORTE_TAXONOMY: readonly SubcategoryRule[] = [
  {
    slug: "zapatillas",
    label: "Zapatillas y calzado",
    keywords: ["zapatilla", "zapato", "calzado", "sandalia", "chancla", "bota", "sneaker"],
  },
  {
    slug: "chaquetas",
    label: "Chaquetas",
    keywords: ["chaqueta", "cazadora", "abrigo", "chubasquero", "parka", "cortavientos", "anorak", "plumifero"],
  },
  {
    slug: "pantalones",
    label: "Pantalones",
    keywords: ["pantalon", "short", "malla", "legging"],
  },
  {
    slug: "camisetas-sudaderas",
    label: "Camisetas y sudaderas",
    keywords: ["camiseta", "sudadera", "camisa", "polo", "jersey", "top", "sujetador deportivo"],
  },
  { slug: "accesorios", label: "Accesorios" }, // comodín: bolsas, gorras, calcetines, balones, guantes...
];

/** Hogar (incluye clima/deshumidificación/herramientas desde Trotec, ver categoryMapping.ts). */
const HOGAR_TAXONOMY: readonly SubcategoryRule[] = [
  {
    slug: "climatizacion",
    label: "Climatización y deshumidificadores",
    keywords: [
      "deshumidificador",
      "climatizador",
      "climatizacion",
      "aire acondicionado",
      "calefactor",
      "calefaccion",
      "ventilador",
      "humidificador",
      "purificador de aire",
    ],
  },
  {
    slug: "herramientas",
    label: "Herramientas",
    keywords: ["herramienta", "taladro", "amoladora", "lijadora", "atornillador", "sierra", "martillo", "generador"],
  },
  { slug: "hogar-jardin", label: "Hogar y jardín" }, // comodín: muebles, menaje, decoración, jardín...
];

/** Categorías principales que admiten pestañas de subcategoría (mismos slugs que `src/data/demo/categories.ts`). Cualquier otra categoría se muestra sin pestañas, como antes. */
const TAXONOMY_BY_CATEGORY_SLUG: Readonly<Record<string, readonly SubcategoryRule[]>> = {
  moda: MODA_DEPORTE_TAXONOMY,
  deporte: MODA_DEPORTE_TAXONOMY,
  hogar: HOGAR_TAXONOMY,
};

/** `null` si la categoría no tiene pestañas de subcategoría definidas. */
export function getSubcategoryTaxonomy(categorySlug: string): readonly SubcategoryRule[] | null {
  return TAXONOMY_BY_CATEGORY_SLUG[categorySlug] ?? null;
}

/**
 * Todas las reglas de subcategoría definidas, de cualquier taxonomía,
 * sin duplicar `MODA_DEPORTE_TAXONOMY` (referenciada dos veces en
 * `TAXONOMY_BY_CATEGORY_SLUG`, para moda Y deporte). Pensado para
 * reutilizar este mismo vocabulario (etiquetas + palabras clave) como
 * tabla de sinónimos del buscador de /supergangas (ver
 * `expandSearchSynonyms` en `src/lib/ofertasFilters.ts`), en vez de
 * mantener un diccionario de equivalencias aparte y desincronizado de
 * las pestañas de subcategoría reales.
 */
export const ALL_SUBCATEGORY_RULES: readonly SubcategoryRule[] = [...MODA_DEPORTE_TAXONOMY, ...HOGAR_TAXONOMY];

/** Misma normalización que `categoryMapping.ts` (quita diacríticos, minúsculas) — aplicada aquí solo para comparar. */
function normalize(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Clasifica `productName` según `taxonomy`. Nunca lanza y nunca devuelve
 * un valor vacío: la última regla de la taxonomía (sin `keywords`) actúa
 * de comodín. Si `taxonomy` estuviera vacía (no debería, todas las
 * taxonomías definidas arriba terminan en comodín), lanza en desarrollo
 * en vez de fallar en silencio — un error de configuración, no de datos.
 */
export function classifyBySubcategory(productName: string, taxonomy: readonly SubcategoryRule[]): SubcategoryRule {
  const normalized = normalize(productName);
  for (const rule of taxonomy) {
    if (rule.keywords?.some((keyword) => normalized.includes(keyword))) {
      return rule;
    }
  }
  const fallback = taxonomy[taxonomy.length - 1];
  if (!fallback) throw new Error("classifyBySubcategory: la taxonomía está vacía, no hay ninguna regla comodín.");
  return fallback;
}

export type SubcategoryTabState<T> = {
  /** Pestañas con al menos un producto, en el mismo orden que la taxonomía. Nunca incluye una pestaña vacía (ver `CategoryProductGrid`: un callejón sin salida). */
  visibleRules: readonly SubcategoryRule[];
  countByType: ReadonlyMap<ProductTypeSlug, number>;
  totalCount: number;
  /** Productos visibles para una pestaña dada; "todas" nunca filtra. */
  productsForTab: (activeType: ProductTypeSlug | "todas") => T[];
};

/**
 * Toda la lógica no-visual de las pestañas de subcategoría (clasificar,
 * contar, decidir qué pestañas mostrar, filtrar), extraída de
 * `CategoryProductGrid.tsx` para poder probarla sin React/DOM — el
 * componente solo la envuelve en JSX y `useState`/`useMemo`.
 */
export function buildSubcategoryTabState<T>(
  products: readonly T[],
  nameOf: (product: T) => string,
  taxonomy: readonly SubcategoryRule[]
): SubcategoryTabState<T> {
  const classified = products.map((product) => ({ product, rule: classifyBySubcategory(nameOf(product), taxonomy) }));

  const countByType = new Map<ProductTypeSlug, number>();
  for (const { rule } of classified) {
    countByType.set(rule.slug, (countByType.get(rule.slug) ?? 0) + 1);
  }

  const visibleRules = taxonomy.filter((rule) => (countByType.get(rule.slug) ?? 0) > 0);

  return {
    visibleRules,
    countByType,
    totalCount: products.length,
    productsForTab: (activeType) =>
      activeType === "todas"
        ? classified.map((c) => c.product)
        : classified.filter((c) => c.rule.slug === activeType).map((c) => c.product),
  };
}
