
/**
 * Parser CSV mínimo (RFC 4180): admite campos entre comillas dobles con
 * comas, saltos de línea y comillas escapadas (""), retorno de carro
 * CRLF/LF, y quita la marca UTF-8 BOM inicial si existe (habitual en
 * exportaciones de Excel). No interpreta HTML ni el nombre del fichero:
 * el contenido se trata siempre como texto plano, nunca como código.
 */
export function parseCsv(content: string): string[][] {
  const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  function pushField() {
    row.push(field);
    field = "";
  }
  function pushRow() {
    pushField();
    rows.push(row);
    row = [];
  }

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (char === "\r") {
      i += 1;
      continue;
    }
    if (char === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }

  // Última fila si el fichero no termina en salto de línea.
  if (field.length > 0 || row.length > 0) pushRow();

  // Descarta líneas completamente vacías (p. ej. una línea en blanco al final).
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/** Convierte filas crudas de `parseCsv` en objetos usando la primera fila como cabecera. */
export function csvRowsToRecords(rows: string[][]): { header: string[]; records: Record<string, string>[] } {
  if (rows.length === 0) return { header: [], records: [] };
  const header = rows[0].map((h) => h.trim());
  const records = rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    header.forEach((key, idx) => {
      record[key] = (row[idx] ?? "").trim();
    });
    return record;
  });
  return { header, records };
}
