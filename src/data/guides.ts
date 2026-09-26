/**
 * Contenido editorial de "Guías de compra" (`/guias`). Son artículos
 * estáticos escritos por Preciara — no proceden del catálogo ni de la
 * sincronización de Awin, no citan productos, precios, descuentos ni
 * valoraciones concretas, y no deben confundirse con `src/data/demo/*`
 * (eso es datos de demostración del catálogo; esto es contenido real).
 *
 * `getGuideBySlug` es la única forma prevista de resolver una guía por su
 * slug: siempre devuelve `undefined` para un slug inexistente, nunca
 * lanza, así que las páginas que la usan pueden llamar a `notFound()`
 * directamente sin comprobaciones adicionales.
 */

export interface GuideSection {
  heading: string;
  body: string[];
}

export interface Guide {
  slug: string;
  /** Categoría editorial mostrada como texto pequeño sobre el título. */
  category: string;
  /** Nombre de icono de lucide-react. */
  icon: string;
  title: string;
  /** Usada como teaser de tarjeta y como meta description. */
  description: string;
  readingTime: string;
  intro: string;
  /** Exactamente cuatro secciones, cada una con contenido propio. */
  sections: GuideSection[];
  checklist?: string[];
  /** Ruta de la categoría relacionada para el CTA final. */
  relatedHref: string;
  /** Texto del CTA final, p. ej. "Ver ofertas en Tecnología". */
  relatedLabel: string;
}

export const guides: Guide[] = [
  {
    slug: "como-comparar-precios-online",
    category: "Comparar precios",
    icon: "Scale",
    title: "Cómo comparar precios online sin llevarte sorpresas",
    description:
      "Antes de fijarte solo en el número final, hay varias cosas que conviene revisar para saber si una oferta es realmente buena.",
    readingTime: "5 min de lectura",
    intro:
      "Comparar precios no es solo buscar el número más bajo: es entender qué estás comparando y bajo qué condiciones. Estas son las claves para hacerlo con criterio.",
    sections: [
      {
        heading: "Compara el mismo producto, no uno parecido",
        body: [
          "Dos productos con nombres casi idénticos pueden tener versiones, capacidades o modelos distintos. Antes de comparar precios, confirma que se trata exactamente de la misma referencia: mismo modelo, misma capacidad o talla y, si aplica, el mismo país de garantía.",
          "Un precio más bajo en un producto ligeramente distinto no es una ganga: es una comparación que no dice lo que parece decir.",
        ],
      },
      {
        heading: "El porcentaje de descuento no cuenta toda la historia",
        body: [
          "Un descuento grande puede calcularse sobre un precio de referencia inflado que nunca se aplicó realmente. Fíjate en el precio final que vas a pagar, no solo en el porcentaje que lo acompaña.",
          "También conviene comparar el precio total: gastos de envío, coste de una posible devolución y si la garantía está incluida o hay que pagarla aparte. Dos ofertas con el mismo precio de producto pueden salir muy distintas una vez sumado todo.",
        ],
      },
      {
        heading: "El historial de precio te dice si es buen momento",
        body: [
          "Un mismo producto puede subir y bajar de precio varias veces al año. Consultar el historial reciente ayuda a saber si el precio actual es realmente bajo, o si ya ha estado igual o más barato antes.",
          "Si el historial no está disponible, al menos compara el precio actual en varias tiendas antes de decidir: un solo precio, visto de forma aislada, no dice mucho.",
        ],
      },
      {
        heading: "La tienda también forma parte de la decisión",
        body: [
          "Un precio bajo en una tienda con plazos de entrega poco claros, política de devolución confusa o mala atención al cliente puede acabar costando más tiempo y dinero que uno algo más alto en una tienda de confianza.",
          "Revisa las condiciones de envío, devolución y garantía de cada tienda antes de comprar, no después: son parte del precio real, aunque no aparezcan en la etiqueta.",
        ],
      },
    ],
    checklist: [
      "Confirma que es exactamente el mismo modelo o referencia",
      "Compara el precio final, no solo el porcentaje de descuento",
      "Suma envío, devolución y garantía al precio del producto",
      "Consulta el historial de precio si está disponible",
      "Revisa las condiciones de la tienda antes de comprar",
    ],
    relatedHref: "/categorias",
    relatedLabel: "Explorar categorías",
  },
  {
    slug: "elegir-tecnologia-reacondicionada",
    category: "Tecnología reacondicionada",
    icon: "RefreshCw",
    title: "Cómo elegir tecnología reacondicionada con garantías",
    description:
      "La tecnología reacondicionada puede ser una alternativa razonable a comprar nuevo, siempre que sepas qué preguntar antes de decidirte.",
    readingTime: "6 min de lectura",
    intro:
      "Reacondicionado no significa lo mismo en todas las tiendas. Antes de comprar, conviene entender qué diferencia un producto reacondicionado de uno simplemente usado, y qué garantías rodean la compra.",
    sections: [
      {
        heading: "Reacondicionado no es lo mismo que usado",
        body: [
          "Un producto usado se revende tal cual, sin revisión ni garantía de funcionamiento más allá de lo que indique quien lo vende. Un producto reacondicionado, en cambio, ha pasado por un proceso de revisión, limpieza y, si hace falta, sustitución de piezas antes de ponerse a la venta.",
          "El nivel real de ese proceso varía mucho de un vendedor a otro, así que merece la pena preguntar en qué consiste exactamente antes de dar por hecho que dos productos «reacondicionados» son comparables.",
        ],
      },
      {
        heading: "Fíjate en la clasificación del estado y en quién responde por ella",
        body: [
          "Muchos vendedores clasifican el estado estético del producto en distintos niveles (por ejemplo, de «como nuevo» a «con marcas visibles de uso»). Esa clasificación no es un estándar único obligatorio, así que conviene leer qué significa exactamente en cada tienda, con fotos reales si es posible.",
          "Comprueba también quién es responsable de la garantía y de una posible devolución: si es el vendedor, un servicio técnico externo o el fabricante. Esa información debería estar disponible antes de comprar, no averiguarse después si algo falla.",
        ],
      },
      {
        heading: "La batería suele ser la pieza que más importa",
        body: [
          "En dispositivos con batería, su estado de salud afecta directamente a la experiencia de uso, y no siempre se recupera igual que el resto del producto. Busca si el vendedor indica el estado o la capacidad de la batería, y si está cubierta por la garantía en caso de degradarse pronto.",
          "Si esa información no aparece, es razonable preguntarla antes de comprar: es uno de los componentes más caros de sustituir por separado.",
        ],
      },
      {
        heading: "Accesorios, bloqueos y el precio frente a comprar nuevo",
        body: [
          "Comprueba qué accesorios incluye realmente la compra (cargador, cable, caja) y si el producto está libre de bloqueos de cuenta o de operador de un propietario anterior: un dispositivo bloqueado puede quedar inutilizable aunque funcione perfectamente.",
          "Por último, compara el precio del reacondicionado con el de un producto nuevo equivalente, incluyendo la garantía de cada opción. La diferencia de precio solo compensa si el estado, la cobertura y las condiciones también te convencen.",
        ],
      },
    ],
    checklist: [
      "Entiende qué proceso de revisión ha tenido el producto",
      "Lee la clasificación de estado con fotos reales, si es posible",
      "Confirma quién responde por la garantía y la devolución",
      "Pregunta por el estado o la cobertura de la batería",
      "Verifica que no tenga bloqueos de un propietario anterior",
      "Compara el precio final con el de un producto nuevo equivalente",
    ],
    relatedHref: "/categoria/tecnologia",
    relatedLabel: "Ver ofertas en Tecnología",
  },
  {
    slug: "como-comparar-electrodomesticos",
    category: "Electrodomésticos",
    icon: "Refrigerator",
    title: "Cómo comparar electrodomésticos antes de comprar",
    description:
      "Un electrodoméstico se usa durante años: estas son las cosas que conviene revisar antes de fijarte solo en el precio de compra.",
    readingTime: "6 min de lectura",
    intro:
      "El precio de compra es solo una parte del coste real de un electrodoméstico. Estas son las preguntas que conviene resolver antes de decidir cuál llevarte.",
    sections: [
      {
        heading: "Comprueba que cabe y que se puede instalar",
        body: [
          "Antes de comparar precios, mide el hueco disponible y compara esas medidas con las del producto, incluyendo el espacio necesario para la apertura de puertas o cajones y la ventilación que pueda necesitar.",
          "Revisa también qué tipo de conexión requiere (eléctrica, agua, desagüe, gas) y si el espacio donde va a instalarse ya cuenta con ella. Un producto más barato que necesita una instalación adicional puede no salir tan a cuenta.",
        ],
      },
      {
        heading: "El consumo también es parte del precio",
        body: [
          "Dos productos con un precio de compra similar pueden tener un consumo energético muy distinto a lo largo de los años. La etiqueta de eficiencia energética da una idea del coste aproximado de uso, y merece la pena tenerla en cuenta junto al precio inicial.",
          "En electrodomésticos que se usan a diario, esa diferencia de consumo puede llegar a compensar, con el tiempo, un precio de compra algo más alto.",
        ],
      },
      {
        heading: "Elige funciones que vayas a usar de verdad",
        body: [
          "Es fácil dejarse llevar por una lista larga de funciones y programas especiales. Antes de pagar por ellas, piensa con sinceridad cuáles vas a usar realmente: pagar por funciones que no se van a usar es un sobrecoste evitable.",
          "Al mismo tiempo, comprueba que el producto cubre lo esencial para tu caso (capacidad, programas básicos, nivel de ruido si te importa) antes de fijarte en extras.",
        ],
      },
      {
        heading: "Entrega, instalación y qué pasa con el aparato antiguo",
        body: [
          "Pregunta si el precio incluye entrega en el domicilio, instalación básica y retirada del aparato antiguo, o si esos servicios se cobran aparte. Son gastos habituales que no siempre aparecen en el precio anunciado.",
          "Por último, revisa qué servicio técnico y atención posventa ofrece la tienda o el fabricante: en un producto que vas a usar durante años, saber a quién acudir si algo falla forma parte de la decisión de compra.",
        ],
      },
    ],
    checklist: [
      "Mide el hueco disponible y compara con las medidas del producto",
      "Confirma el tipo de conexión que necesita",
      "Ten en cuenta el consumo energético, no solo el precio de compra",
      "Elige funciones que realmente vayas a usar",
      "Pregunta si la entrega y la instalación están incluidas",
      "Comprueba qué retirada del aparato antiguo se ofrece",
      "Revisa el servicio técnico y la atención posventa disponibles",
    ],
    relatedHref: "/categoria/electrodomesticos",
    relatedLabel: "Ver ofertas en Electrodomésticos",
  },
];

export function getGuideBySlug(slug: string): Guide | undefined {
  return guides.find((guide) => guide.slug === slug);
}
