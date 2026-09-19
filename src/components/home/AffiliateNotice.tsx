import Link from "next/link";
import { Info } from "lucide-react";

export function AffiliateNotice() {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-700">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        Algunos enlaces de esta página son enlaces de afiliado: Preciara
        puede recibir una comisión si compras a través de ellos, sin coste
        adicional para ti.{" "}
        <Link href="/aviso-afiliacion" className="underline decoration-teal-600/40 underline-offset-2 hover:decoration-teal-600">
          Más información
        </Link>
        .
      </p>
    </div>
  );
}
