import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacidad y cookies",
  description: "Qué datos trata Preciara y qué cookies utiliza este sitio.",
};

export default function PrivacidadPage() {
  return (
    <LegalPage title="Privacidad y cookies" updated="Fase 1 — versión de demostración">
      <p>
        Esta página resume, en términos sencillos, el tratamiento de datos
        previsto para Preciara. Se ampliará con el aviso legal completo
        cuando el sitio incorpore registro de usuarios y trate datos
        personales reales.
      </p>

      <section>
        <h2 className="font-serif text-lg font-semibold text-navy-900">Situación actual</h2>
        <p className="mt-2">
          En esta versión, Preciara no requiere registro ni inicio de
          sesión, y no recopila datos personales de las personas visitantes
          más allá de los técnicos estrictamente necesarios para servir el
          sitio.
        </p>
      </section>

      <section>
        <h2 className="font-serif text-lg font-semibold text-navy-900">Cookies</h2>
        <p className="mt-2">
          El sitio no instala cookies de analítica, publicidad ni
          seguimiento en esta fase. Si en el futuro se incorporan (por
          ejemplo, para recordar preferencias de usuario o alertas de
          precio), se solicitará el consentimiento correspondiente antes de
          activarlas.
        </p>
      </section>

      <section>
        <h2 className="font-serif text-lg font-semibold text-navy-900">Próximas fases</h2>
        <p className="mt-2">
          Cuando se incorpore un sistema de usuarios y alertas de precio,
          esta página se ampliará para detallar qué datos personales se
          tratan, con qué finalidad, durante cuánto tiempo y cómo puedes
          ejercer tus derechos de acceso, rectificación y supresión.
        </p>
      </section>
    </LegalPage>
  );
}
