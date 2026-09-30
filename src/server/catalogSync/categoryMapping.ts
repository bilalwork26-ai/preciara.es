/**
 * Mapeo conservador del texto de categoría que aporta un feed de Awin
 * (columna `merchant_category`/`category_name`, ver `awinFeedParser.ts`) a
 * la taxonomía de categorías YA existente y navegable de Preciara (mismos
 * slugs que `src/data/demo/categories.ts`/`CategoryRow`) — nunca un slug
 * nuevo derivado a ciegas del texto crudo de cada comercio, que fragmentaría
 * el catálogo en decenas de categorías casi-duplicadas ("Portátiles",
 * "Ordenadores y tablets", "Informática"...) en vez de agruparlas todas bajo
 * la categoría real que el usuario ya conoce y navega.
 *
 * COBERTURA DELIBERADAMENTE CONSERVADORA: solo las categorías con
 * palabras clave lo bastante inequívocas como para clasificar con
 * confianza razonable (Tecnología, Electrodomésticos, Hogar, Infantil,
 * Deporte, Moda). El resto de la taxonomía de Preciara (Salud y cuidado,
 * Viajes, Motor, Jardín y bricolaje, Mascotas, Libros y ocio) se deja
 * FUERA a propósito: unas palabras clave adivinadas sin ver un feed real
 * tendrían más riesgo de clasificar mal que de acertar.
 *
 * DEPORTE se comprueba ANTES que MODA a propósito: el primer anunciante
 * real (Adidas) es una marca deportiva — calzado/ropa con una señal de
 * deporte explícita en el texto (p. ej. "Ropa deportiva", "Fútbol",
 * "Calzado de running") debe caer en Deporte aunque también contenga
 * palabras genéricas de Moda ("ropa", "calzado", "zapatilla"). Un texto
 * de calzado/ropa SIN ninguna señal de deporte (p. ej. "Calzado y
 * zapatillas" a secas, sin más contexto) sigue cayendo en Moda — ver el
 * test correspondiente.
 *
 * HOGAR incluye también clima/deshumidificación/herramientas de
 * bricolaje desde que Trotec se sumó como segundo anunciante real: su
 * catálogo (deshumidificadores, calefactores, herramientas eléctricas...)
 * no encajaba en ninguna palabra clave anterior y caía en "Otros".
 *
 * Cualquier texto que no coincida con ninguna regla cae en
 * `GENERIC_CATEGORY_TARGET` ("Otros") — la fila NUNCA se rechaza ni se
 * omite solo por esto (el producto sigue siendo real y válido, solo sin
 * categoría específica) y NUNCA se asigna de forma aleatoria: el resultado
 * es siempre determinista para el mismo texto de entrada. La categoría
 * genérica se crea con el mismo mecanismo que cualquier otra
 * (`findOrCreateCategory`, ver `applyOffer.ts`) — nunca un sistema aparte.
 *
 * ANTES DE CONECTAR UNA CUENTA REAL DE AWIN: igual que el resto de
 * `awinFeedParser.ts`, estas palabras clave no se han podido contrastar
 * contra un feed real (WebFetch bloqueado en este entorno, ver el
 * comentario de fuentes de `awinFeedParser.ts`) — revísalas contra los
 * primeros feeds reales aprobados antes de confiar en la clasificación a
 * ciegas. Están centralizadas aquí, en un único sitio, fácil de ajustar
 * sin tocar el resto del parser.
 */

export type CategoryMappingTarget = { slug: string; name: string };

/** Respaldo para texto de categoría que no coincide con ninguna regla — siempre una categoría real y válida, nunca la ausencia de una. */
export const GENERIC_CATEGORY_TARGET: CategoryMappingTarget = { slug: "otros", name: "Otros" };

/** Mismos slugs que `src/data/demo/categories.ts` — reutiliza la taxonomía ya navegable, nunca inventa una nueva. */
const TECNOLOGIA: CategoryMappingTarget = { slug: "tecnologia", name: "Tecnología" };
const ELECTRODOMESTICOS: CategoryMappingTarget = { slug: "electrodomesticos", name: "Electrodomésticos" };
const HOGAR: CategoryMappingTarget = { slug: "hogar", name: "Hogar" };
const INFANTIL: CategoryMappingTarget = { slug: "infantil", name: "Infantil" };
const DEPORTE: CategoryMappingTarget = { slug: "deporte", name: "Deporte" };
const MODA: CategoryMappingTarget = { slug: "moda", name: "Moda" };

/**
 * Reglas en orden de comprobación — de más específico a más genérico, para
 * que un texto ambiguo ("electrodomésticos de cocina") caiga en la
 * categoría más concreta (electrodomésticos) antes que en la más amplia
 * (hogar). La primera regla cuya palabra clave aparezca como subcadena del
 * texto normalizado (sin acentos, minúsculas) gana; nunca se combinan
 * varias coincidencias.
 */
const KEYWORD_RULES: readonly { target: CategoryMappingTarget; keywords: readonly string[] }[] = [
  {
    target: ELECTRODOMESTICOS,
    keywords: [
      "electrodomestic",
      "appliance",
      "lavadora",
      "secadora",
      "lavavajillas",
      "frigorifico",
      "nevera",
      "congelador",
      "microondas",
      "vitroceramica",
      "induccion",
      "aspiradora",
      "vacuum cleaner",
      "campana extractora",
      "white goods",
    ],
  },
  {
    target: TECNOLOGIA,
    keywords: [
      "tecnolog",
      "electronic",
      "electronica",
      "computing",
      "computer",
      "ordenador",
      "laptop",
      // "portatil" ("portátil") se quitó a propósito: pensada para
      // "ordenador portátil", pero como subcadena suelta coincide con
      // CUALQUIER "[algo] portátil" de cualquier vertical (caso real
      // detectado al añadir Trotec: "deshumidificador portátil"), no solo
      // ordenadores. "ordenador" y "laptop" ya cubren el caso real sin
      // ese riesgo de falso positivo cruzado.
      "tablet",
      "smartphone",
      "movil",
      "telefonia",
      "television",
      "smart tv",
      "videojuego",
      "gaming",
      "consola",
      "informatica",
      "auricular",
    ],
  },
  {
    target: INFANTIL,
    // "nino"/"nina" (ya sin diacríticos, como queda "niño"/"niña" tras
    // normalize()), nunca el fragmento suelto "nin": coincidía también
    // dentro de palabras sin relación ("running", "peninsula"...) — bug
    // real encontrado al añadir la regla de Deporte más abajo.
    keywords: ["infantil", "bebe", "baby", "juguete", "toy", "kids", "nino", "nina"],
  },
  {
    target: DEPORTE,
    keywords: [
      "deporte",
      "deportiv",
      "sport",
      "futbol",
      "baloncesto",
      "balonmano",
      "balon",
      "padel",
      "tenis",
      "ciclismo",
      "running",
      "gimnasio",
      "fitness",
      "entrenamiento",
      "training",
      "trekking",
      "senderismo",
      "hiking",
      "natacion",
      "gym",
    ],
  },
  {
    target: MODA,
    keywords: [
      "moda",
      "ropa",
      "clothing",
      "apparel",
      "fashion",
      "calzado",
      "footwear",
      "zapatilla",
      "zapato",
      "vestido",
      "camiseta",
      "pantalon",
    ],
  },
  {
    target: HOGAR,
    keywords: [
      "hogar",
      "home",
      "mueble",
      "furniture",
      "decoracion",
      "menaje",
      "textil hogar",
      "bano",
      "cocina",
      // Añadidas al conectar Trotec (clima/deshumidificación/herramientas
      // de bricolaje) como segundo anunciante real de Awin: su texto de
      // categoría no tenía ninguna palabra clave que lo cubriera y caía
      // en "Otros" en vez de en Hogar. Mismo criterio conservador que el
      // resto del fichero — solo términos de clima/herramienta lo bastante
      // inequívocos, nunca palabras que puedan significar otra cosa.
      "deshumidificador",
      "climatizador",
      "climatizacion",
      "aire acondicionado",
      "calefactor",
      "calefaccion",
      "ventilador",
      "humidificador",
      "purificador de aire",
      "generador electrico",
      "herramienta",
      "taladro",
      "amoladora",
      "lijadora",
      "atornillador",
      "bricolaje",
      "jardin",
    ],
  },
];

/** Quita diacríticos y pasa a minúsculas — la misma normalización que ya usa `slugify` en `awinFeedParser.ts`, aplicada aquí solo para comparar, nunca para derivar el slug final. */
function normalize(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Clasifica el texto de categoría de un feed en la taxonomía existente de
 * Preciara. Nunca lanza y nunca devuelve un valor vacío: si ninguna regla
 * coincide con suficiente confianza, devuelve `GENERIC_CATEGORY_TARGET`.
 */
export function mapAwinCategoryText(rawCategoryText: string): CategoryMappingTarget {
  const normalized = normalize(rawCategoryText);
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.target;
    }
  }
  return GENERIC_CATEGORY_TARGET;
}
