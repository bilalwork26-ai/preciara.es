import { Search } from "lucide-react";

/**
 * Formulario GET nativo: funciona sin JavaScript y envía a /buscar?q=...
 */
export function SearchForm() {
  return (
    <form
      action="/buscar"
      method="GET"
      role="search"
      className="flex w-full flex-col gap-2 rounded-2xl border border-border bg-white p-2 shadow-sm sm:flex-row sm:items-center"
    >
      <label htmlFor="search-q" className="sr-only">
        Qué producto quieres comparar
      </label>
      <div className="flex flex-1 items-center gap-2 px-3 py-2">
        <Search className="h-5 w-5 shrink-0 text-navy-300" aria-hidden="true" strokeWidth={1.75} />
        <input
          id="search-q"
          name="q"
          type="search"
          placeholder="¿Qué producto quieres comparar?"
          className="w-full bg-transparent text-base text-navy-900 placeholder:text-navy-300 focus:outline-none"
        />
      </div>
      <button
        type="submit"
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-ivory transition-colors hover:bg-teal-700"
      >
        Buscar
      </button>
    </form>
  );
}
