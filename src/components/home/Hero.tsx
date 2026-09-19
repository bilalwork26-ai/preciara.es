import { SearchForm } from "./SearchForm";
import { CategoryPills } from "./CategoryPills";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-beige/60 to-ivory">
      <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-12 sm:px-6 sm:pt-16 lg:px-8">
        <div className="max-w-2xl">
          <h1 className="font-serif text-4xl font-semibold leading-[1.1] tracking-tight text-navy-900 sm:text-5xl">
            Precios claros.
            <br />
            Compras inteligentes.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-navy-500">
            Compara precios, sigue su evolución y compra siempre en el mejor
            momento.
          </p>

          <div className="mt-6">
            <SearchForm />
          </div>
        </div>

        <div id="categorias" className="mt-8 scroll-mt-24">
          <CategoryPills />
        </div>
      </div>
    </section>
  );
}
