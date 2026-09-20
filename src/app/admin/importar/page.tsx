import { CSV_COLUMNS } from "@/server/importer/validate";
import { MAX_CSV_ROWS, MAX_CSV_BYTES } from "@/server/importer/run";
import { CsvImportForm } from "./CsvImportForm";

export const metadata = { title: "Importar CSV — Panel técnico", robots: { index: false, follow: false } };

export default function AdminImportPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-serif text-2xl font-bold text-navy-900">Importar ofertas desde CSV</h1>
        <p className="mt-1 max-w-2xl text-sm text-navy-500">
          Sube un CSV UTF-8 con las columnas documentadas abajo (máx. {(MAX_CSV_BYTES / 1024 / 1024).toFixed(0)} MB,{" "}
          {MAX_CSV_ROWS} filas). Usa &ldquo;Simular&rdquo; primero para ver qué se crearía o actualizaría sin tocar la
          base de datos: no escribe nada ni deja rastro en el historial.
        </p>
      </div>

      <CsvImportForm />

      <div className="rounded-xl border border-border bg-white p-4">
        <h2 className="font-serif text-lg font-semibold text-navy-900">Columnas del CSV</h2>
        <div className="mt-2 overflow-x-auto">
          <code className="block whitespace-pre text-xs text-navy-700">{CSV_COLUMNS.join(",\n")}</code>
        </div>
        <p className="mt-3 text-xs text-navy-300">
          Ejemplo ficticio disponible en <code>examples/ofertas-ejemplo.csv</code> del repositorio. Detalle completo de
          cada columna y las reglas de validación en el README (&ldquo;Formato CSV&rdquo;).
        </p>
      </div>
    </div>
  );
}
