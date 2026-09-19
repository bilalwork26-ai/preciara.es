import { ShieldCheck, Store, LineChart, ClipboardCheck, Leaf } from "lucide-react";

/**
 * Mensajes deliberadamente neutrales: describen funciones del sitio, no
 * cifras ni resultados ("miles de productos", "tiendas comparadas"...).
 * Mientras el catálogo sea de demostración no podemos afirmar hechos.
 */
const items = [
  { icon: ShieldCheck, title: "Comparación clara", subtitle: "Precios organizados en un solo lugar" },
  { icon: Store, title: "Diferentes tiendas", subtitle: "Compara opciones antes de decidir" },
  { icon: LineChart, title: "Historial de precios", subtitle: "Consulta cómo cambia cada precio" },
  { icon: ClipboardCheck, title: "Datos fáciles de entender", subtitle: "Sin información confusa" },
  { icon: Leaf, title: "Consumo inteligente", subtitle: "Decide con más información" },
];

export function TrustStrip() {
  return (
    <div className="border-b border-border bg-ivory">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <ul
          className="no-scrollbar flex snap-x gap-6 overflow-x-auto py-3 lg:grid lg:grid-cols-5 lg:gap-4 lg:overflow-visible"
          aria-label="Indicadores de confianza"
          tabIndex={0}
        >
          {items.map(({ icon: Icon, title, subtitle }, i) => (
            <li
              key={title}
              className={`flex shrink-0 snap-start items-center gap-2.5 lg:border-l lg:pl-4 lg:first:border-l-0 lg:first:pl-0 ${
                i > 0 ? "border-border" : ""
              }`}
            >
              <Icon className="h-5 w-5 shrink-0 text-teal-600" aria-hidden="true" strokeWidth={1.75} />
              <div className="whitespace-nowrap lg:whitespace-normal">
                <p className="text-sm font-semibold text-navy-900">{title}</p>
                <p className="text-xs text-navy-300">{subtitle}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
