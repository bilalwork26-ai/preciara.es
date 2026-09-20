export type BrandCarouselSlide = {
  id: string;
  headline: string;
  text: string;
};

/** Mensajes del carrusel publicitario de marca, debajo de la cabecera. */
export const brandCarouselSlides: BrandCarouselSlide[] = [
  {
    id: "compara-mejor",
    headline: "Compara precios. Compra mejor.",
    text: "Toda la información que necesitas para decidir con claridad.",
  },
  {
    id: "precios-claros",
    headline: "Precios claros. Decisiones inteligentes.",
    text: "Compara tiendas y consulta cómo evoluciona cada precio.",
  },
  {
    id: "momento-adecuado",
    headline: "Encuentra el momento adecuado para comprar.",
    text: "Menos búsquedas. Más información en un solo lugar.",
  },
  {
    id: "compara-decide-ahorra",
    headline: "Compara. Decide. Ahorra.",
    text: "Una forma más clara de descubrir tus próximas compras.",
  },
];
