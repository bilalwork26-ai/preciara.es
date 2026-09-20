"use client";

import { useRef, useState } from "react";
import Link from "next/link";

type ImportSummary = {
  importRunId: number | null;
  dryRun: boolean;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  rowsRead: number;
  productsCreated: number;
  productsUpdated: number;
  offersCreated: number;
  offersUpdated: number;
  rowsRejected: number;
  errors: { rowNumber: number; code: string; message: string }[];
};

const STATUS_LABELS: Record<ImportSummary["status"], string> = {
  SUCCESS: "Correcta",
  PARTIAL: "Con avisos",
  FAILED: "Fallida",
};

/** Frase en lenguaje llano, pensada para alguien sin conocimientos técnicos. */
function plainLanguageSummary(result: ImportSummary): string {
  const accion = result.dryRun ? "Si importaras este fichero de verdad" : "Se ha importado el fichero";
  const productos = result.productsCreated + result.productsUpdated;
  const ofertas = result.offersCreated + result.offersUpdated;

  if (result.status === "FAILED") {
    return `${accion}, pero ninguna fila se pudo aprovechar (${result.rowsRejected} de ${result.rowsRead} rechazadas). Revisa el detalle de abajo.`;
  }

  const partesProductos =
    productos > 0
      ? `${result.productsCreated} producto(s) nuevo(s) y ${result.productsUpdated} actualizado(s)`
      : "ningún producto nuevo ni actualizado";
  const partesOfertas =
    ofertas > 0 ? `${result.offersCreated} oferta(s) nueva(s) y ${result.offersUpdated} actualizada(s)` : "ninguna oferta";

  const rechazadas =
    result.rowsRejected > 0
      ? ` ${result.rowsRejected} fila(s) de ${result.rowsRead} no se pudieron usar (detalle abajo).`
      : " Todas las filas se aprovecharon.";

  return `${accion}: ${partesProductos}, y ${partesOfertas}.${rechazadas}`;
}

export function CsvImportForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(dryRun: boolean) {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Selecciona primero un fichero CSV.");
      return;
    }
    setBusy(dryRun ? "preview" : "import");
    setError(null);

    const formData = new FormData();
    formData.set("file", file);
    formData.set("dryRun", String(dryRun));

    try {
      const res = await fetch("/api/admin/import", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error inesperado.");
        setResult(null);
      } else {
        setResult(data);
      }
    } catch {
      setError("No se pudo contactar con el servidor.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-white p-4">
        <label htmlFor="csv-file" className="block text-sm font-medium text-navy-900">
          Fichero CSV (UTF-8)
        </label>
        <input
          id="csv-file"
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="mt-2 block w-full text-sm text-navy-700 file:mr-3 file:rounded-full file:border-0 file:bg-navy-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
          onChange={() => {
            setResult(null);
            setError(null);
          }}
        />

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => submit(true)}
            className="rounded-full border border-teal-600 px-4 py-2 text-sm font-semibold text-teal-700 transition-colors hover:bg-teal-50 disabled:opacity-50"
          >
            {busy === "preview" ? "Simulando…" : "Simular (sin escribir en la base de datos)"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => submit(false)}
            className="rounded-full bg-coral-500 px-4 py-2 text-sm font-semibold text-navy-900 transition-colors hover:bg-coral-600 hover:text-white disabled:opacity-50"
          >
            {busy === "import" ? "Importando…" : "Importar de verdad"}
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-coral-50 px-3 py-2 text-sm text-coral-600" role="alert">
            {error}
          </p>
        )}
      </div>

      {result && (
        <div className="rounded-xl border border-border bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-serif text-lg font-semibold text-navy-900">
              {result.dryRun ? "Resultado de la simulación" : "Resultado de la importación"}
            </h2>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                result.status === "SUCCESS"
                  ? "bg-teal-50 text-teal-700"
                  : result.status === "PARTIAL"
                    ? "bg-coral-50 text-coral-600"
                    : "bg-coral-100 text-coral-600"
              }`}
            >
              {STATUS_LABELS[result.status]}
            </span>
            {!result.dryRun && result.importRunId && (
              <Link href={`/admin/importaciones/${result.importRunId}`} className="text-xs font-medium text-teal-600 hover:text-teal-700">
                Ver ejecución #{result.importRunId}
              </Link>
            )}
          </div>

          <p className="mt-3 text-sm text-navy-700">{plainLanguageSummary(result)}</p>

          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase text-navy-300">Filas leídas</dt>
              <dd className="font-semibold text-navy-900">{result.rowsRead}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-navy-300">Rechazadas</dt>
              <dd className="font-semibold text-navy-900">{result.rowsRejected}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-navy-300">Productos creados/actualizados</dt>
              <dd className="font-semibold text-navy-900">
                {result.productsCreated} / {result.productsUpdated}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-navy-300">Ofertas creadas/actualizadas</dt>
              <dd className="font-semibold text-navy-900">
                {result.offersCreated} / {result.offersUpdated}
              </dd>
            </div>
          </dl>

          {result.errors.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase text-navy-300">Filas rechazadas</p>
              <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                {result.errors.slice(0, 30).map((e, i) => (
                  <li key={i} className="rounded-lg bg-beige/60 px-3 py-2">
                    <span className="font-mono text-xs text-navy-500">
                      fila {e.rowNumber} · {e.code}
                    </span>
                    <p className="text-navy-700">{e.message}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
