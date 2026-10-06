/**
 * Texto editorial de `/categoria/[slug]`: un párrafo breve justo debajo
 * del título (contexto rápido, antes de la rejilla de productos) y un
 * bloque algo más largo al final de la página (guía de compra concreta,
 * después de ver el catálogo). Pensado para que la página tenga contenido
 * real propio más allá de una simple lista de productos — requisito
 * habitual de revisión de redes publicitarias (AdSense) contra el
 * "contenido de poco valor" de páginas que son solo una rejilla.
 *
 * Contenido fijo por categoría (no generado a partir de `products`, que
 * cambia constantemente con cada sincronización): cada texto es específico
 * de esa categoría, nunca una plantilla genérica con el nombre intercambiado
 * sin más. `DEFAULT_EDITORIAL` cubre cualquier slug no listado aquí
 * explícitamente (p. ej. "otros", el comodín de `categoryMapping.ts`, o una
 * categoría de demostración futura).
 */
export type CategoryEditorial = {
  /** Párrafo corto (1-3 frases), justo debajo del título y el recuento de productos. */
  intro: string;
  /** Título del bloque de guía de compra, al final de la página. */
  guideTitle: string;
  /** Guía de compra más larga (2-4 frases), después de la rejilla de productos. */
  guide: string;
};

const CATEGORY_EDITORIAL: Readonly<Record<string, CategoryEditorial>> = {
  tecnologia: {
    intro:
      "Descubre chollos en smartphones, informática y dispositivos de última generación. Compara precios y compra la mejor tecnología con total confianza.",
    guideTitle: "Cómo elegir tecnología al mejor precio",
    guide:
      "El precio de un mismo modelo puede variar bastante de una tienda a otra, sobre todo en lanzamientos recientes o durante campañas puntuales de descuento. Antes de comprar, compara el precio final (sin sorpresas de envío) entre varias tiendas y revisa si el vendedor es el fabricante, un distribuidor oficial o un marketplace — puede afectar a la garantía y al plazo de devolución. Si no necesitas la última generación, un modelo con un año de antigüedad suele ofrecer mucho mejor relación calidad-precio.",
  },
  hogar: {
    // Texto dado tal cual por el usuario para "Hogar y Belleza". La
    // taxonomía real separa Hogar (aquí) de Belleza y Salud (slug
    // `salud-cuidado`, página propia) — este texto menciona ambos
    // dominios ("cosmética, cuidado personal... y artículos para tu
    // hogar"), así que se aplica aquí por ser la lectura más directa de
    // "Hogar y Belleza", no por ser un encaje perfecto. Ver el resumen de
    // la PR para más detalle.
    intro:
      "Consigue ofertas exclusivas en cosmética, cuidado personal y artículos para tu hogar. Elige el precio que mejor se adapte a ti.",
    guideTitle: "Cómo elegir productos para el hogar",
    guide:
      "En climatización (deshumidificadores, calefactores, ventiladores) fíjate en el consumo eléctrico declarado y el tamaño de la estancia que puede cubrir el aparato, no solo en el precio de compra — un modelo más barato pero menos eficiente puede salir más caro a medio plazo. En herramientas, comprueba si el precio incluye batería y cargador cuando el producto los necesita: es un extra habitual que algunos anuncios no dejan claro a primera vista.",
  },
  electrodomesticos: {
    intro:
      "Frigoríficos, lavadoras, lavavajillas y el resto de grandes electrodomésticos, con el precio de cada tienda a la vista para comparar antes de decidir.",
    guideTitle: "Cómo elegir un electrodoméstico al mejor precio",
    guide:
      "La etiqueta energética influye directamente en el gasto de electricidad durante toda la vida útil del aparato, así que merece la pena compararla además del precio de compra. Revisa también las medidas exactas antes de comprar (sobre todo en lavadoras y frigoríficos empotrables) y si el precio anunciado incluye el transporte e instalación básica, un coste que varía mucho entre tiendas y que no siempre aparece en el precio destacado.",
  },
  "salud-cuidado": {
    intro: "Cuidado personal, bienestar y pequeños aparatos de salud, comparados entre varias tiendas españolas.",
    guideTitle: "Antes de comprar productos de salud y cuidado",
    guide:
      "En aparatos de cuidado personal (cepillos eléctricos, afeitadoras, termómetros...) comprueba siempre que el vendedor sea una tienda identificable con política de devolución clara, especialmente si el producto va a estar en contacto directo con la piel. El precio más bajo no siempre es la mejor opción si el envío tarda semanas o la tienda no responde ante una incidencia.",
  },
  deporte: {
    intro:
      "Equípate al mejor precio con nuestra selección de productos de deporte, calzado técnico y nutrición. Compara ofertas de las mejores tiendas.",
    guideTitle: "Cómo acertar con la talla y el precio en ropa deportiva",
    guide:
      "La talla de calzado y ropa deportiva varía bastante según la marca y el país de origen del fabricante — si no has comprado antes ese modelo concreto, conviene revisar la tabla de tallas propia de la tienda en vez de guiarte solo por tu talla habitual. Compara también la política de cambios: en calzado técnico (running, fútbol) poder devolverlo si no es tu talla real tiene tanto valor como el precio en sí.",
  },
  moda: {
    intro:
      "Encuentra las mejores ofertas en ropa, calzado y accesorios de marcas líderes. Compara precios y renueva tu armario ahorrando en cada compra.",
    guideTitle: "Antes de comprar ropa y calzado online",
    guide:
      "Cada marca tiene su propia tabla de tallas, así que una «M» no siempre significa lo mismo de una tienda a otra — revisa las medidas exactas en centímetros cuando la tienda las ofrezca, en vez de fiarte solo de la letra. Ten en cuenta también los gastos y plazos de devolución antes de comprar varias tallas a la vez para probar: no todas las tiendas los asumen igual.",
  },
  infantil: {
    intro: "Ropa, calzado, juguetes y artículos de puericultura, comparados entre varias tiendas españolas.",
    guideTitle: "Qué revisar antes de comprar productos infantiles",
    guide:
      "En artículos de seguridad infantil (sillas de coche, cunas, juguetes para bebés) comprueba siempre que el producto cumpla el marcado CE europeo, visible en la ficha del fabricante. En ropa y calzado infantil, los niños crecen rápido: a veces compensa más una talla por encima con buena relación calidad-precio que ajustar al milímetro la talla actual.",
  },
  viajes: {
    intro: "Equipaje, accesorios de viaje y artículos para la maleta, comparados por precio entre varias tiendas.",
    guideTitle: "Cómo elegir equipaje al mejor precio",
    guide:
      "Antes de comprar una maleta, comprueba las medidas exactas (incluyendo ruedas y asas) contra el límite de equipaje de mano o facturado de tu aerolínea habitual — unos centímetros de más pueden suponer un cargo extra en el aeropuerto. El peso en vacío de la maleta también cuenta para el límite total permitido, así que una maleta más ligera deja más margen para el contenido.",
  },
  motor: {
    intro: "Accesorios y recambios básicos para el coche y la moto, comparados entre varias tiendas españolas.",
    guideTitle: "Antes de comprar accesorios para el coche",
    guide:
      "Comprueba siempre la compatibilidad exacta con la marca, modelo y año de tu vehículo antes de comprar un accesorio o recambio — una pieza que parece igual en la foto puede no encajar en tu modelo concreto. En productos de seguridad (luces, frenos, neumáticos) prioriza siempre que cumplan la normativa vigente sobre un precio más bajo.",
  },
  "jardin-bricolaje": {
    intro: "Herramientas, mobiliario de exterior y artículos de jardín y bricolaje, de varias tiendas y marcas.",
    guideTitle: "Cómo elegir herramientas y artículos de jardín",
    guide:
      "En herramientas eléctricas, comprueba si el precio incluye batería y cargador cuando el modelo los necesita — es un extra que cambia mucho el precio final real entre anuncios aparentemente similares. En mobiliario de exterior, revisa el material (resina trenzada, aluminio, madera tratada) y su resistencia a la intemperie, no solo las medidas y el precio.",
  },
  mascotas: {
    intro: "Alimentación, accesorios y artículos de cuidado para mascotas, comparados entre varias tiendas.",
    guideTitle: "Antes de comprar productos para tu mascota",
    guide:
      "En alimentación, compara el precio por kilo (no solo el precio del paquete) entre formatos y marcas distintas, ya que el tamaño del envase varía mucho de una tienda a otra. Revisa también la fecha de fabricación o caducidad cuando la tienda la muestre, sobre todo en pienso y snacks comprados en formato grande.",
  },
  "libros-ocio": {
    intro: "Libros, juegos de mesa y artículos de ocio, con el precio de cada tienda a la vista para comparar.",
    guideTitle: "Cómo comparar precios en libros y ocio",
    guide:
      "El mismo libro o juego de mesa puede tener precios distintos según la tienda y si está en oferta de lanzamiento o ya lleva tiempo en catálogo — merece la pena comparar antes de comprar, sobre todo en novedades. En juegos de mesa, fíjate también en si el anuncio es la edición en español: algunas tiendas venden también importaciones en otro idioma a un precio similar.",
  },
};

const DEFAULT_EDITORIAL: CategoryEditorial = {
  intro: "Productos de varias tiendas y marcas, con el precio de cada una a la vista para comparar antes de decidir.",
  guideTitle: "Cómo comparar precios antes de comprar",
  guide:
    "Compara siempre el precio final de cada tienda, incluidos los gastos de envío cuando los haya, antes de decidir dónde comprar: un precio de producto más bajo no siempre es la opción más barata en total. Revisa también la disponibilidad real (en stock o bajo pedido) y la política de devoluciones de cada tienda, sobre todo si es la primera vez que compras ahí.",
};

export function getCategoryEditorial(categorySlug: string): CategoryEditorial {
  return CATEGORY_EDITORIAL[categorySlug] ?? DEFAULT_EDITORIAL;
}
