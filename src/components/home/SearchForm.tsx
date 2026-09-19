import { Search } from "lucide-react";

type SearchFormProps = {
  /** Único por instancia: el formulario puede aparecer varias veces en la página (cabecera de escritorio y móvil). */
  id: string;
  className?: string;
  placeholder?: string;
};

/**
 * Formulario GET nativo: funciona sin JavaScript y envía a /buscar?q=...
 * Normaliza tildes en el propio /buscar (ver COMBINING_MARKS en esa página).
 */
export function SearchForm({
  id,
  className,
  placeholder = "¿Qué producto estás buscando?",
}: SearchFormProps) {
  return (
    <form
      action="/buscar"
      method="GET"
      role="search"
      className={`flex w-full items-center gap-2 rounded-full bg-white p-1.5 shadow-sm ${className ?? ""}`}
    >
      <label htmlFor={id} className="sr-only">
        Qué producto quieres comparar
      </label>
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5">
        <Search className="h-5 w-5 shrink-0 text-navy-300" aria-hidden="true" strokeWidth={1.75} />
        <input
          id={id}
          name="q"
          type="search"
          placeholder={placeholder}
          className="w-full min-w-0 bg-transparent text-[15px] text-navy-900 placeholder:text-navy-300 focus:outline-none"
        />
      </div>
      <button
        type="submit"
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
      >
        Buscar
      </button>
    </form>
  );
}
