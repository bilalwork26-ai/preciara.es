/**
 * Tokenizador CSV (RFC 4180) en STREAMING: procesa fragmentos de texto de
 * forma incremental (`AsyncIterable<string>`) y emite cada fila completa en
 * cuanto termina de leerla, sin esperar a tener el fichero entero en
 * memoria — a diferencia de `src/server/importer/csv.ts` (`parseCsv`), que
 * recibe el contenido completo como un único `string` y está pensado para
 * los ficheros pequeños que ya sí caben enteros en memoria (el CSV del
 * importador manual). Esta versión existe para feeds de catálogo que
 * pueden tener cientos de miles de filas (Awin, y cualquier adaptador
 * futuro) — ver `awinFeedParser.ts`.
 *
 * Misma gramática que `parseCsv`: campos entre comillas dobles con comas y
 * saltos de línea dentro, comillas escapadas (`""`), CRLF/LF indistintos,
 * marca UTF-8 BOM inicial descartada si existe, y las líneas completamente
 * vacías se omiten (nunca se emiten como fila) — igual que
 * `parseCsv`+`csvRowsToRecords`.
 *
 * El llamador es responsable de decodificar bytes a texto UTF-8 antes de
 * entregar los fragmentos aquí (p. ej. `readable.setEncoding("utf8")` o
 * `TextDecoderStream`): Node/el runtime ya garantizan que un flujo con la
 * codificación fijada nunca parte un carácter multibyte entre dos
 * fragmentos — reimplementar ese ensamblado de bytes aquí duplicaría una
 * garantía que la plataforma ya ofrece, y es justo el motivo por el que
 * esta función solo pide `string`, nunca `Buffer`.
 *
 * Manejo de comillas dobles partidas EXACTAMENTE en el límite entre dos
 * fragmentos (p. ej. un fragmento termina en `"` y el siguiente empieza en
 * `"`, que en conjunto forman el escape `""`): se resuelve sin mirar nunca
 * "hacia adelante" en el fragmento (que podría no existir todavía) — al
 * ver la primera `"` que cierra una zona entre comillas se marca un estado
 * "pendiente de confirmar" (`justClosedQuote`) que se resuelve al procesar
 * el carácter siguiente, venga del mismo fragmento o de uno posterior.
 *
 * Nunca trata un fichero cortado como una descarga completa: si el
 * iterable de fragmentos lanza (fallo de red/lectura a mitad) o termina
 * con un campo entre comillas todavía abierto (una señal inequívoca de
 * truncamiento — un CSV válido nunca deja una comilla sin cerrar), esta
 * función SIEMPRE lanza `StreamingCsvTruncatedError` en vez de devolver en
 * silencio las filas que sí llegó a completar.
 */

export class StreamingCsvTruncatedError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
  }
}

/** Envuelve un `string` ya completo como el único fragmento de un iterable asíncrono — útil para ejercitar el mismo tokenizador en pruebas o con entradas pequeñas sin necesitar un stream real. */
export async function* singleChunk(content: string): AsyncGenerator<string> {
  yield content;
}

/** Trocea un `string` en fragmentos de tamaño fijo — útil en pruebas para demostrar que el tokenizador procesa de verdad de forma incremental y no espera a tener todo el contenido. */
export async function* chunked(content: string, chunkSize: number): AsyncGenerator<string> {
  for (let i = 0; i < content.length; i += chunkSize) {
    yield content.slice(i, i + chunkSize);
  }
}

/**
 * Tokeniza un CSV en streaming: consume `chunks` de forma incremental y
 * emite (`yield`) cada fila (`string[]`) en cuanto está completa.
 */
export async function* parseCsvStream(chunks: AsyncIterable<string>): AsyncGenerator<string[]> {
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  /** true justo después de ver una `"` que cerraba una zona entre comillas: el carácter siguiente decide si en realidad era un escape (`""`) o un cierre real. */
  let justClosedQuote = false;
  let isFirstChar = true;

  function isBlankRow(candidate: string[]): boolean {
    return candidate.length === 1 && candidate[0] === "";
  }

  try {
    for await (const chunk of chunks) {
      for (let i = 0; i < chunk.length; i++) {
        const char = chunk[i];

        if (isFirstChar) {
          isFirstChar = false;
          if (char === "﻿") continue; // BOM inicial: se descarta, nunca cuenta como contenido
        }

        if (justClosedQuote) {
          justClosedQuote = false;
          if (char === '"') {
            // Las dos comillas juntas eran un escape (""): una comilla literal, se sigue dentro del campo entre comillas.
            field += '"';
            inQuotes = true;
            continue;
          }
          // La comilla anterior era de verdad un cierre: este carácter se procesa con las reglas normales (fuera de comillas), cae al bloque de abajo.
        }

        if (inQuotes) {
          if (char === '"') {
            justClosedQuote = true;
            inQuotes = false;
            continue;
          }
          field += char;
          continue;
        }

        if (char === '"') {
          inQuotes = true;
          continue;
        }
        if (char === ",") {
          row.push(field);
          field = "";
          continue;
        }
        if (char === "\r") {
          continue; // se descarta siempre; si forma parte de un CRLF, el "\n" que sigue (en este fragmento o en el siguiente) es quien cierra la fila
        }
        if (char === "\n") {
          row.push(field);
          field = "";
          if (!isBlankRow(row)) yield row;
          row = [];
          continue;
        }
        field += char;
      }
    }
  } catch (error) {
    throw new StreamingCsvTruncatedError("Fallo de lectura del feed a mitad de la descarga (la fuente se interrumpió).", error);
  }

  // `justClosedQuote` sin resolver al llegar aquí solo puede significar que
  // la entrada terminó justo tras una comilla de cierre — eso SÍ es un
  // cierre válido, no una comilla abierta, así que no es señal de
  // truncamiento. Únicamente `inQuotes` (todavía dentro de una zona entre
  // comillas al acabar la entrada) indica de verdad un truncamiento.
  if (inQuotes) {
    throw new StreamingCsvTruncatedError("El feed termina con un campo entre comillas sin cerrar: la descarga está truncada.");
  }

  // Última fila si el fichero no termina en salto de línea.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (!isBlankRow(row)) yield row;
  }
}

/** Cabecera + un registro (columna → valor) por fila de datos — construido de forma incremental a partir de `parseCsvStream`, igual que `csvRowsToRecords` pero sin materializar todas las filas a la vez. */
export async function* csvRecordStream(chunks: AsyncIterable<string>): AsyncGenerator<{ header: string[]; record: Record<string, string>; rowNumber: number }> {
  let header: string[] | null = null;
  let rowNumber = 0; // cuenta filas de DATOS (sin incluir la cabecera), en base 1 — el número que se reporta en errores de fila.

  for await (const row of parseCsvStream(chunks)) {
    if (header === null) {
      header = row.map((h) => h.trim());
      continue;
    }
    rowNumber += 1;
    const record: Record<string, string> = {};
    header.forEach((key, idx) => {
      record[key] = (row[idx] ?? "").trim();
    });
    yield { header, record, rowNumber };
  }
}
