import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { AwinFeedListFatalError, parseAwinFeedList, redactFeedListUrl, type AwinFeedListResult } from "./awinFeedListParser";
import { StreamingCsvTruncatedError, chunked } from "./streamingCsv";

const FULL_HEADER = "Advertiser ID,Advertiser Name,Primary Region,Membership Status,Feed ID,Feed Name,Language,Vertical,Last Imported,URL";

/** Un token distintivo y muy improbable de aparecer por azar — actúa de "canario": si aparece en cualquier salida de diagnóstico, la prueba correspondiente debe fallar. */
const CANARY_API_KEY = "CANARY-SECRET-DOWNLOAD-TOKEN-9f8e7d6c5b4a";
function canaryUrl(path = "/datafeed/download/apikey"): string {
  return `https://productdata.awin.com${path}/${CANARY_API_KEY}/language/es/fid/12345/format/csv`;
}

function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function row(fields: Record<string, string>): string {
  const header = FULL_HEADER.split(",");
  return header.map((col) => csvField(fields[col] ?? "")).join(",");
}

async function collect(csv: string): Promise<AwinFeedListResult[]> {
  const results: AwinFeedListResult[] = [];
  for await (const result of parseAwinFeedList(csv)) results.push(result);
  return results;
}

function approved(results: AwinFeedListResult[]): Extract<AwinFeedListResult, { status: "approved" }>[] {
  return results.filter((r): r is Extract<AwinFeedListResult, { status: "approved" }> => r.status === "approved");
}
function skipped(results: AwinFeedListResult[]): Extract<AwinFeedListResult, { status: "skipped" }>[] {
  return results.filter((r): r is Extract<AwinFeedListResult, { status: "skipped" }> => r.status === "skipped");
}
function invalid(results: AwinFeedListResult[]): Extract<AwinFeedListResult, { status: "invalid" }>[] {
  return results.filter((r): r is Extract<AwinFeedListResult, { status: "invalid" }> => r.status === "invalid");
}

describe("parseAwinFeedList: varios anunciantes aprobados", () => {
  it("varios anunciantes distintos, todos Joined, se aprueban todos", async () => {
    const csv = [
      FULL_HEADER,
      row({ "Advertiser ID": "100", "Advertiser Name": "Tienda Uno", "Membership Status": "Joined", "Feed ID": "1000", "Feed Name": "Feed A", URL: "https://x.invalid/a" }),
      row({ "Advertiser ID": "200", "Advertiser Name": "Tienda Dos", "Membership Status": "Joined", "Feed ID": "2000", "Feed Name": "Feed B", URL: "https://x.invalid/b" }),
      row({ "Advertiser ID": "300", "Advertiser Name": "Tienda Tres", "Membership Status": "Joined", "Feed ID": "3000", "Feed Name": "Feed C", URL: "https://x.invalid/c" }),
    ].join("\n");
    const results = approved(await collect(csv));
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.feed.advertiserId)).toEqual(["100", "200", "300"]);
  });
});

describe("parseAwinFeedList: anunciante no aprobado excluido", () => {
  it("un anunciante con Membership Status distinto de Joined se excluye del resultado 'approved', pero se reporta como 'skipped' (nunca desaparece en silencio)", async () => {
    const csv = [
      FULL_HEADER,
      row({ "Advertiser ID": "100", "Advertiser Name": "Aprobada", "Membership Status": "Joined", "Feed ID": "1000", "Feed Name": "Feed A", URL: "https://x.invalid/a" }),
      row({ "Advertiser ID": "200", "Advertiser Name": "Pendiente", "Membership Status": "Not Joined", "Feed ID": "2000", "Feed Name": "Feed B", URL: "https://x.invalid/b" }),
    ].join("\n");
    const results = await collect(csv);
    expect(approved(results)).toHaveLength(1);
    expect(approved(results)[0].feed.advertiserId).toBe("100");
    expect(skipped(results)).toHaveLength(1);
    expect(skipped(results)[0].advertiserId).toBe("200");
    expect(skipped(results)[0].reason).toBe("not_joined");
    expect(skipped(results)[0].membershipStatus).toBe("Not Joined");
  });

  it.each(["Pending", "Relationship Ended", "Suspended", ""])("Membership Status %j nunca se aprueba automáticamente", async (status) => {
    const csv = [FULL_HEADER, row({ "Advertiser ID": "100", "Advertiser Name": "X", "Membership Status": status, "Feed ID": "1000", "Feed Name": "Feed A", URL: "https://x.invalid/a" })].join("\n");
    const results = await collect(csv);
    expect(approved(results)).toHaveLength(0);
  });
});

describe("parseAwinFeedList: varios feeds del mismo anunciante", () => {
  it("un mismo Advertiser ID con varios Feed ID conserva TODOS sus feeds — nunca se deduce un único feed por anunciante", async () => {
    const csv = [
      FULL_HEADER,
      row({ "Advertiser ID": "100", "Advertiser Name": "Tienda Multi-feed", "Membership Status": "Joined", "Feed ID": "1001", "Feed Name": "Catálogo ES", URL: "https://x.invalid/1001" }),
      row({ "Advertiser ID": "100", "Advertiser Name": "Tienda Multi-feed", "Membership Status": "Joined", "Feed ID": "1002", "Feed Name": "Catálogo PT", URL: "https://x.invalid/1002" }),
      row({ "Advertiser ID": "100", "Advertiser Name": "Tienda Multi-feed", "Membership Status": "Joined", "Feed ID": "1003", "Feed Name": "Catálogo Outlet", URL: "https://x.invalid/1003" }),
    ].join("\n");
    const results = approved(await collect(csv));
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.feed.advertiserId === "100")).toBe(true);
    expect(new Set(results.map((r) => r.feed.feedId)).size).toBe(3);
    expect(new Set(results.map((r) => r.feed.id)).size).toBe(3); // identidades distintas, nunca colapsadas
  });
});

describe("parseAwinFeedList: diferentes idiomas y verticales", () => {
  it("Language y Vertical se conservan tal cual por fila, incluso variando dentro del mismo anunciante", async () => {
    const csv = [
      FULL_HEADER,
      row({ "Advertiser ID": "100", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "A", Language: "es", Vertical: "Moda", URL: "https://x.invalid/1" }),
      row({ "Advertiser ID": "100", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "2", "Feed Name": "B", Language: "pt", Vertical: "Hogar", URL: "https://x.invalid/2" }),
    ].join("\n");
    const results = approved(await collect(csv));
    expect(results.map((r) => [r.feed.language, r.feed.vertical])).toEqual([
      ["es", "Moda"],
      ["pt", "Hogar"],
    ]);
  });

  it("Language y Vertical ausentes (columna vacía) se normalizan a null, sin rechazar la fila", async () => {
    const csv = [FULL_HEADER, row({ "Advertiser ID": "100", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "A", URL: "https://x.invalid/1" })].join("\n");
    const results = approved(await collect(csv));
    expect(results[0].feed.language).toBeNull();
    expect(results[0].feed.vertical).toBeNull();
  });
});

describe("parseAwinFeedList: espacios y variantes de mayúsculas en 'Joined'", () => {
  it.each(["Joined", "joined", "JOINED", "JoInEd", "  Joined  ", " joined"])("%j se reconoce como aprobado", async (status) => {
    const csv = [FULL_HEADER, row({ "Advertiser ID": "100", "Advertiser Name": "X", "Membership Status": status, "Feed ID": "1", "Feed Name": "A", URL: "https://x.invalid/1" })].join("\n");
    const results = approved(await collect(csv));
    expect(results).toHaveLength(1);
  });

  it("'Not Joined' NUNCA se confunde con 'Joined' pese a contenerlo como subcadena", async () => {
    const csv = [FULL_HEADER, row({ "Advertiser ID": "100", "Advertiser Name": "X", "Membership Status": "Not Joined", "Feed ID": "1", "Feed Name": "A", URL: "https://x.invalid/1" })].join("\n");
    const results = await collect(csv);
    expect(approved(results)).toHaveLength(0);
    expect(skipped(results)).toHaveLength(1);
  });
});

describe("parseAwinFeedList: comas, comillas, Unicode y saltos de línea", () => {
  it("Advertiser Name/Feed Name con comas y comillas dentro (RFC 4180) se interpretan como un único valor", async () => {
    const trickyName = `Tienda "Especial", con coma`;
    const csv = [FULL_HEADER, row({ "Advertiser ID": "100", "Advertiser Name": trickyName, "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "A", URL: "https://x.invalid/1" })].join("\n");
    const results = approved(await collect(csv));
    expect(results[0].feed.advertiserName).toBe(trickyName);
  });

  it("un campo con salto de línea dentro de comillas se conserva íntegro", async () => {
    const nameWithNewline = "Feed\ncon salto de línea";
    const csv = [FULL_HEADER, row({ "Advertiser ID": "100", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": nameWithNewline, URL: "https://x.invalid/1" })].join("\n");
    const results = approved(await collect(csv));
    expect(results[0].feed.feedName).toBe(nameWithNewline);
  });

  it("caracteres Unicode (acentos, eñes, emoji, CJK) se preservan intactos", async () => {
    const csv = [FULL_HEADER, row({ "Advertiser ID": "100", "Advertiser Name": "Cámara España 📷 日本語", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "Ñandú Moda", URL: "https://x.invalid/1" })].join("\n");
    const results = approved(await collect(csv));
    expect(results[0].feed.advertiserName).toBe("Cámara España 📷 日本語");
    expect(results[0].feed.feedName).toBe("Ñandú Moda");
  });
});

describe("parseAwinFeedList: cabeceras ausentes (error FATAL, no de fila)", () => {
  it("una lista completamente vacía (sin cabecera ni datos) lanza AwinFeedListFatalError", async () => {
    await expect(async () => {
      for await (const _ of parseAwinFeedList("")) void _;
    }).rejects.toThrow(AwinFeedListFatalError);
  });

  it("una cabecera presente pero sin ninguna de las columnas mínimas esperadas es fatal (MISSING_REQUIRED_COLUMNS)", async () => {
    const csv = "columna_irrelevante_1,columna_irrelevante_2\nvalor1,valor2";
    let caught: unknown;
    try {
      for await (const _ of parseAwinFeedList(csv)) void _;
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AwinFeedListFatalError);
    expect((caught as AwinFeedListFatalError).code).toBe("MISSING_REQUIRED_COLUMNS");
  });
});

describe("parseAwinFeedList: fila con columnas incorrectas", () => {
  it("una fila con menos columnas que la cabecera se rechaza como COLUMN_COUNT_MISMATCH, sin abortar el resto de la lista", async () => {
    const csv = [FULL_HEADER, "100,Incompleta", row({ "Advertiser ID": "200", "Advertiser Name": "Buena", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "A", URL: "https://x.invalid/1" })].join("\n");
    const results = await collect(csv);
    expect(invalid(results).some((r) => r.code === "COLUMN_COUNT_MISMATCH")).toBe(true);
    expect(approved(results)).toHaveLength(1);
  });
});

describe("parseAwinFeedList: identificadores inválidos", () => {
  it.each(["abc", "12.5", "-1", "", "12 34"])("Advertiser ID %j se rechaza", async (advertiserId) => {
    const csv = [FULL_HEADER, row({ "Advertiser ID": advertiserId, "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "A", URL: "https://x.invalid/1" })].join("\n");
    const results = await collect(csv);
    expect(approved(results)).toHaveLength(0);
    expect(invalid(results)[0].code).toMatch(/ADVERTISER_ID|MISSING_FIELD/);
  });

  it.each(["abc", "12.5", "-1", ""])("Feed ID %j se rechaza", async (feedId) => {
    const csv = [FULL_HEADER, row({ "Advertiser ID": "100", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": feedId, "Feed Name": "A", URL: "https://x.invalid/1" })].join("\n");
    const results = await collect(csv);
    expect(approved(results)).toHaveLength(0);
    expect(invalid(results)[0].code).toMatch(/FEED_ID|MISSING_FIELD/);
  });

  it("un Advertiser ID puramente numérico se acepta", async () => {
    const csv = [FULL_HEADER, row({ "Advertiser ID": "123456", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "A", URL: "https://x.invalid/1" })].join("\n");
    expect(approved(await collect(csv))).toHaveLength(1);
  });
});

describe("parseAwinFeedList: fecha inválida o ausente", () => {
  it("Last Imported ausente (columna vacía) se normaliza a null, sin rechazar la fila", async () => {
    const csv = [FULL_HEADER, row({ "Advertiser ID": "100", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "A", URL: "https://x.invalid/1" })].join("\n");
    const results = approved(await collect(csv));
    expect(results[0].feed.lastImported).toBeNull();
  });

  it("Last Imported con una fecha ISO válida se parsea correctamente", async () => {
    const csv = [FULL_HEADER, row({ "Advertiser ID": "100", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "A", "Last Imported": "2026-09-20T10:00:00Z", URL: "https://x.invalid/1" })].join("\n");
    const results = approved(await collect(csv));
    expect(results[0].feed.lastImported?.toISOString()).toBe("2026-09-20T10:00:00.000Z");
  });

  it("Last Imported con texto que no es una fecha se rechaza (INVALID_DATE)", async () => {
    const csv = [FULL_HEADER, row({ "Advertiser ID": "100", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "A", "Last Imported": "no-es-una-fecha", URL: "https://x.invalid/1" })].join("\n");
    const results = await collect(csv);
    expect(approved(results)).toHaveLength(0);
    expect(invalid(results)[0].code).toBe("INVALID_DATE");
  });
});

describe("parseAwinFeedList: URL inválida", () => {
  it("una URL sin esquema http(s) se rechaza (INVALID_URL)", async () => {
    const csv = [FULL_HEADER, row({ "Advertiser ID": "100", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "A", URL: "ftp://x.invalid/1" })].join("\n");
    const results = await collect(csv);
    expect(approved(results)).toHaveLength(0);
    expect(invalid(results)[0].code).toBe("INVALID_URL");
  });

  it("una URL vacía se rechaza (MISSING_FIELD)", async () => {
    const csv = [FULL_HEADER, row({ "Advertiser ID": "100", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "A", URL: "" })].join("\n");
    const results = await collect(csv);
    expect(invalid(results)[0].code).toBe("MISSING_FIELD");
  });

  it("una URL con formato claramente inválido (no analizable) se rechaza (INVALID_URL)", async () => {
    const csv = [FULL_HEADER, row({ "Advertiser ID": "100", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "A", URL: "no es una url" })].join("\n");
    const results = await collect(csv);
    expect(invalid(results)[0].code).toBe("INVALID_URL");
  });
});

describe("parseAwinFeedList: stream truncado", () => {
  it("si la fuente de fragmentos falla a mitad, la excepción se propaga (StreamingCsvTruncatedError)", async () => {
    async function* source() {
      yield `${FULL_HEADER}\n`;
      yield row({ "Advertiser ID": "100", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "A", URL: "https://x.invalid/1" }) + "\n";
      throw new Error("conexión cortada a mitad de la descarga (simulado)");
    }
    await expect(async () => {
      for await (const _ of parseAwinFeedList(source())) void _;
    }).rejects.toThrow(StreamingCsvTruncatedError);
  });

  it("una lista que termina con un campo entre comillas sin cerrar lanza StreamingCsvTruncatedError", async () => {
    async function* source() {
      yield `${FULL_HEADER}\n`;
      yield '100,"Tienda que se corta a mitad de la descarga y nunca cierra la comilla';
    }
    await expect(async () => {
      for await (const _ of parseAwinFeedList(source())) void _;
    }).rejects.toThrow(StreamingCsvTruncatedError);
  });
});

describe("parseAwinFeedList: catálogo grande procesado incrementalmente", () => {
  const ROW_COUNT = 5000;

  function buildLargeCsv(): string {
    const lines = [FULL_HEADER];
    for (let i = 1; i <= ROW_COUNT; i++) {
      lines.push(row({ "Advertiser ID": String(1000 + i), "Advertiser Name": `Anunciante ${i}`, "Membership Status": "Joined", "Feed ID": String(9000 + i), "Feed Name": `Feed ${i}`, URL: `https://x.invalid/${i}` }));
    }
    return lines.join("\n");
  }

  it("procesa 5000 filas en fragmentos pequeños, emitiendo resultados ANTES de consumir todo el contenido", async () => {
    const csv = buildLargeCsv();
    const CHUNK_SIZE = 512;
    const totalChunks = Math.ceil(csv.length / CHUNK_SIZE);

    let consumedChunks = 0;
    async function* instrumentedSource() {
      for await (const chunk of chunked(csv, CHUNK_SIZE)) {
        consumedChunks += 1;
        yield chunk;
      }
    }

    let firstApprovedAtChunk: number | null = null;
    let approvedCount = 0;
    for await (const result of parseAwinFeedList(instrumentedSource())) {
      if (result.status === "approved") {
        approvedCount += 1;
        if (firstApprovedAtChunk === null) firstApprovedAtChunk = consumedChunks;
      }
    }

    expect(approvedCount).toBe(ROW_COUNT);
    expect(firstApprovedAtChunk).not.toBeNull();
    expect(firstApprovedAtChunk!).toBeLessThan(totalChunks / 2);
  });

  it("emite TODOS los feeds aprobados del catálogo grande, nunca una muestra", async () => {
    const csv = buildLargeCsv();
    const ids: string[] = [];
    for await (const result of parseAwinFeedList(csv)) {
      if (result.status === "approved") ids.push(result.feed.id);
    }
    expect(ids).toHaveLength(ROW_COUNT);
    expect(new Set(ids).size).toBe(ROW_COUNT);
  });
});

describe("parseAwinFeedList: duplicados exactos tratados de forma determinista", () => {
  it("dos filas EXACTAMENTE iguales (mismo Advertiser ID + Feed ID + Language + Vertical + Primary Region) se emiten ambas, con la MISMA identidad calculada — el parser no las deduplica en silencio, pero la identidad es determinista para que una capa posterior sí pueda hacerlo", async () => {
    const duplicateRow = row({
      "Advertiser ID": "100",
      "Advertiser Name": "X",
      "Membership Status": "Joined",
      "Feed ID": "1",
      "Feed Name": "A",
      Language: "es",
      Vertical: "Moda",
      "Primary Region": "ES",
      URL: "https://x.invalid/1",
    });
    const csv = [FULL_HEADER, duplicateRow, duplicateRow].join("\n");
    const results = approved(await collect(csv));
    expect(results).toHaveLength(2);
    expect(results[0].feed.id).toBe(results[1].feed.id);
  });

  it("la identidad es puramente una función de los 5 componentes (advertiserId, feedId, language, vertical, primaryRegion): recalcularla con los mismos datos da siempre el mismo resultado, y con Feed ID distinto da un resultado distinto", async () => {
    const csvA = [FULL_HEADER, row({ "Advertiser ID": "100", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "A", URL: "https://x.invalid/1" })].join("\n");
    const csvB = [FULL_HEADER, row({ "Advertiser ID": "100", "Advertiser Name": "Y", "Membership Status": "Joined", "Feed ID": "2", "Feed Name": "B", URL: "https://x.invalid/2" })].join("\n");
    const resultsA = approved(await collect(csvA));
    const resultsB = approved(await collect(csvB));
    const resultsA2 = approved(await collect(csvA));
    expect(resultsA[0].feed.id).toBe(resultsA2[0].feed.id);
    expect(resultsA[0].feed.id).not.toBe(resultsB[0].feed.id);
  });
});

describe("parseAwinFeedList: identidad sin colisiones entre variantes del mismo anunciante/feed", () => {
  function baseFields(overrides: Record<string, string> = {}): Record<string, string> {
    return { "Advertiser ID": "100", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "A", URL: "https://x.invalid/1", ...overrides };
  }

  async function idOf(fields: Record<string, string>): Promise<string> {
    const csv = [FULL_HEADER, row(fields)].join("\n");
    const results = approved(await collect(csv));
    expect(results).toHaveLength(1);
    return results[0].feed.id;
  }

  it("mismo Advertiser ID + Feed ID pero distinto Language produce una identidad DISTINTA", async () => {
    const idEs = await idOf(baseFields({ Language: "es" }));
    const idPt = await idOf(baseFields({ Language: "pt" }));
    expect(idEs).not.toBe(idPt);
  });

  it("mismo Advertiser ID + Feed ID pero distinto Vertical produce una identidad DISTINTA", async () => {
    const idModa = await idOf(baseFields({ Vertical: "Moda" }));
    const idHogar = await idOf(baseFields({ Vertical: "Hogar" }));
    expect(idModa).not.toBe(idHogar);
  });

  it("mismo Advertiser ID + Feed ID pero distinto Primary Region produce una identidad DISTINTA", async () => {
    const idEs = await idOf(baseFields({ "Primary Region": "ES" }));
    const idPt = await idOf(baseFields({ "Primary Region": "PT" }));
    expect(idEs).not.toBe(idPt);
  });

  it("diferencias PURAMENTE de espacios o de mayúsculas/minúsculas en cualquier componente producen la MISMA identidad", async () => {
    const idA = await idOf(baseFields({ Language: "es", Vertical: "Moda", "Primary Region": "ES" }));
    const idB = await idOf(baseFields({ Language: "  ES  ", Vertical: "moda", "Primary Region": "  es" }));
    expect(idA).toBe(idB);
  });

  it("un separador ingenuo (':') dentro de Language/Vertical no puede hacer que dos combinaciones DISTINTAS colisionen — la codificación con prefijo de longitud evita justo esta ambigüedad", async () => {
    // Con una concatenación ingenua "language:vertical:region" ambas filas
    // producirían el mismo texto "a:b:c:" — precisamente el problema que
    // resuelve `encodeIdentityComponent` con su prefijo de longitud.
    const idX = await idOf(baseFields({ Language: "a:b", Vertical: "c", "Primary Region": "" }));
    const idY = await idOf(baseFields({ Language: "a", Vertical: "b:c", "Primary Region": "" }));
    expect(idX).not.toBe(idY);
  });

  it("caracteres Unicode (CJK, emoji) en Vertical no provocan colisiones entre valores distintos", async () => {
    const idA = await idOf(baseFields({ Vertical: "日本語" }));
    const idB = await idOf(baseFields({ Vertical: "📷" }));
    const idC = await idOf(baseFields({ Vertical: "Moda" }));
    expect(new Set([idA, idB, idC]).size).toBe(3);
  });

  it("formas Unicode equivalentes por compatibilidad (NFKC) normalizan a la MISMA identidad, de forma estable", async () => {
    // "Ｖ" (V de ancho completo) se normaliza con NFKC a "V" (ASCII).
    const idFullWidth = await idOf(baseFields({ Vertical: "Ｖ" }));
    const idAscii = await idOf(baseFields({ Vertical: "V" }));
    expect(idFullWidth).toBe(idAscii);
  });
});

describe("redactFeedListUrl: representación segura para logs — nunca la clave de descarga", () => {
  it("devuelve solo el esquema y el host, nunca la ruta ni la query (donde va el token)", () => {
    const redacted = redactFeedListUrl(canaryUrl());
    expect(redacted).toBe("https://productdata.awin.com/…");
    expect(redacted).not.toContain(CANARY_API_KEY);
  });

  it("una URL no analizable produce un marcador genérico, nunca el texto original", () => {
    const redacted = redactFeedListUrl(`esto no es una url pero contiene ${CANARY_API_KEY}`);
    expect(redacted).not.toContain(CANARY_API_KEY);
    expect(redacted).toBe("[URL de feed no analizable]");
  });
});

describe("confirmación: una API key canario y la URL completa NUNCA aparecen en errores, logs ni representaciones seguras", () => {
  it("una fila 'invalid' cuya URL es justo la inválida nunca incluye la URL ni la clave en el mensaje de error", async () => {
    const brokenUrlWithCanary = `no-es-una-url-pero-contiene ${CANARY_API_KEY}`;
    const csv = [FULL_HEADER, row({ "Advertiser ID": "100", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "A", URL: brokenUrlWithCanary })].join("\n");
    const results = await collect(csv);
    const invalidResult = invalid(results)[0];
    expect(invalidResult).toBeDefined();
    expect(invalidResult.code).toBe("INVALID_URL");
    expect(invalidResult.message).not.toContain(CANARY_API_KEY);
    expect(invalidResult.message).not.toContain(brokenUrlWithCanary);
    expect(JSON.stringify(invalidResult)).not.toContain(CANARY_API_KEY);
  });

  it("una fila rechazada por OTRO motivo (fecha inválida) en la MISMA fila que trae una URL canario tampoco filtra la URL en su mensaje", async () => {
    const csv = [
      FULL_HEADER,
      row({ "Advertiser ID": "100", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "A", "Last Imported": "fecha-invalida", URL: canaryUrl() }),
    ].join("\n");
    const results = await collect(csv);
    const invalidResult = invalid(results)[0];
    expect(invalidResult.code).toBe("INVALID_DATE");
    expect(invalidResult.message).not.toContain(CANARY_API_KEY);
    expect(JSON.stringify(invalidResult)).not.toContain(CANARY_API_KEY);
  });

  it("una fila 'skipped' (no Joined) con URL canario nunca incluye la URL en su representación", async () => {
    const csv = [FULL_HEADER, row({ "Advertiser ID": "100", "Advertiser Name": "X", "Membership Status": "Not Joined", "Feed ID": "1", "Feed Name": "A", URL: canaryUrl() })].join("\n");
    const results = await collect(csv);
    const skippedResult = skipped(results)[0];
    expect(skippedResult).toBeDefined();
    expect(JSON.stringify(skippedResult)).not.toContain(CANARY_API_KEY);
    expect(JSON.stringify(skippedResult)).not.toContain(canaryUrl());
  });

  it("un error FATAL (columnas mínimas ausentes) nunca puede filtrar una URL canario porque nunca llega a leer ninguna fila de datos", async () => {
    const csv = "columna_irrelevante\nvalor_irrelevante";
    let caught: unknown;
    try {
      for await (const _ of parseAwinFeedList(csv)) void _;
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AwinFeedListFatalError);
    expect((caught as AwinFeedListFatalError).message).not.toContain(CANARY_API_KEY);
  });

  it("una fila COLUMN_COUNT_MISMATCH cuyo contenido bruto incluye una URL canario tampoco la filtra (el mensaje solo describe recuentos de columnas)", async () => {
    const csv = [FULL_HEADER, `100,Incompleta,${canaryUrl()}`].join("\n");
    const results = await collect(csv);
    const mismatch = invalid(results).find((r) => r.code === "COLUMN_COUNT_MISMATCH");
    expect(mismatch).toBeDefined();
    expect(mismatch!.message).not.toContain(CANARY_API_KEY);
  });

  it("una fila APROBADA sí permite obtener la URL real vía `revealSensitiveUrlForDownload()` (es el dato legítimo que se necesita más adelante) — la protección es sobre logs/errores, nunca sobre el propio dato", async () => {
    const csv = [FULL_HEADER, row({ "Advertiser ID": "100", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "A", URL: canaryUrl() })].join("\n");
    const results = approved(await collect(csv));
    expect(results[0].feed.url.revealSensitiveUrlForDownload()).toBe(canaryUrl());
  });
});

describe("SensitiveFeedUrl: la URL secreta nunca se filtra por accidente en ninguna forma habitual de serializar/inspeccionar", () => {
  async function approvedFeedWithCanaryUrl(): Promise<AwinFeedListResult> {
    const csv = [FULL_HEADER, row({ "Advertiser ID": "100", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "A", URL: canaryUrl() })].join("\n");
    const results = approved(await collect(csv));
    return results[0];
  }

  it("JSON.stringify del resultado 'approved' completo no contiene el token canario ni la URL completa", async () => {
    const result = await approvedFeedWithCanaryUrl();
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(CANARY_API_KEY);
    expect(serialized).not.toContain(canaryUrl());
  });

  it("JSON.stringify de `feed.url` en solitario tampoco contiene el token canario", async () => {
    const result = await approvedFeedWithCanaryUrl();
    if (result.status !== "approved") throw new Error("se esperaba un resultado 'approved'");
    const serialized = JSON.stringify(result.feed.url);
    expect(serialized).not.toContain(CANARY_API_KEY);
    expect(serialized).not.toContain(canaryUrl());
  });

  it("String(feed.url) y la interpolación de plantillas no contienen el token canario", async () => {
    const result = await approvedFeedWithCanaryUrl();
    if (result.status !== "approved") throw new Error("se esperaba un resultado 'approved'");
    expect(String(result.feed.url)).not.toContain(CANARY_API_KEY);
    expect(`${result.feed.url}`).not.toContain(CANARY_API_KEY);
  });

  it("util.inspect (usado por console.log/console.error) de `feed.url`, y del resultado completo que lo contiene, no expone el token canario", async () => {
    const result = await approvedFeedWithCanaryUrl();
    if (result.status !== "approved") throw new Error("se esperaba un resultado 'approved'");
    expect(inspect(result.feed.url)).not.toContain(CANARY_API_KEY);
    expect(inspect(result)).not.toContain(CANARY_API_KEY);
  });

  it("`revealSensitiveUrlForDownload()` devuelve EXACTAMENTE la URL real necesitada por el futuro descargador — ni más redactada ni distinta", async () => {
    const result = await approvedFeedWithCanaryUrl();
    if (result.status !== "approved") throw new Error("se esperaba un resultado 'approved'");
    expect(result.feed.url.revealSensitiveUrlForDownload()).toBe(canaryUrl());
  });

  it("la representación redactada (`toString()`/`toJSON()`) contiene, como mucho, esquema, host y '…' — nunca ruta ni query", async () => {
    const result = await approvedFeedWithCanaryUrl();
    if (result.status !== "approved") throw new Error("se esperaba un resultado 'approved'");
    const expectedRedacted = "https://productdata.awin.com/…";
    expect(result.feed.url.toString()).toBe(expectedRedacted);
    expect(result.feed.url.toJSON()).toBe(expectedRedacted);
  });
});
