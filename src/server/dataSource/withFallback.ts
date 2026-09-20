/**
 * Punto único de la decisión "base de datos o demo". Nada fuera de este
 * fichero decide ese fallback: cada función de src/server/dataSource/*
 * llama a `resolveWithFallback` en vez de escribir su propio if/try
 * distinto. Así la regla es siempre la misma en toda la portada:
 *
 *   - Sin DATABASE_URL, con un error de consulta, o con una respuesta
 *     "insuficiente" (según decida cada llamador con `isSufficient`) ->
 *     se usa el dato de demostración tal cual está hoy en src/data/demo.
 *   - Con datos reales suficientes -> se usan esos datos.
 *
 * El resultado siempre incluye `source` para que quien lo consuma (y el
 * panel técnico) sepa de dónde vino, sin mostrar nunca ese detalle al
 * visitante.
 */

export type SourcedResult<T> = { data: T; source: "database" | "demo" };

export async function resolveWithFallback<T>(params: {
  fetchFromDb: () => Promise<T | null>;
  demoFallback: T;
  isSufficient?: (data: T) => boolean;
}): Promise<SourcedResult<T>> {
  const { fetchFromDb, demoFallback, isSufficient = defaultIsSufficient } = params;

  const dbData = await fetchFromDb();
  if (dbData !== null && isSufficient(dbData)) {
    return { data: dbData, source: "database" };
  }
  return { data: demoFallback, source: "demo" };
}

function defaultIsSufficient<T>(data: T): boolean {
  if (Array.isArray(data)) return data.length > 0;
  return data !== null && data !== undefined;
}
