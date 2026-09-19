import { ShieldCheck, Clock, CheckCircle2, Leaf } from "lucide-react";

const items = [
  { icon: ShieldCheck, text: "Precios verificados y actualizados a diario" },
  { icon: Clock, text: "Historial de precios en cada producto" },
  { icon: CheckCircle2, text: "Solo mostramos bajadas confirmadas" },
  { icon: Leaf, text: "Comprar mejor, también es comprar con cabeza" },
];

export function TrustIndicators() {
  return (
    <ul className="grid grid-cols-1 gap-4 border-t border-border py-8 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(({ icon: Icon, text }) => (
        <li key={text} className="flex items-center gap-3">
          <Icon className="h-5 w-5 shrink-0 text-teal-600" aria-hidden="true" strokeWidth={1.75} />
          <span className="text-sm text-navy-700">{text}</span>
        </li>
      ))}
    </ul>
  );
}
