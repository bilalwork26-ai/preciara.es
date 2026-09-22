import { describe, expect, it } from "vitest";
import { chunked, csvRecordStream, parseCsvStream, singleChunk, StreamingCsvTruncatedError } from "./streamingCsv";

async function collectRows(content: string, chunkSize?: number): Promise<string[][]> {
  const source = chunkSize ? chunked(content, chunkSize) : singleChunk(content);
  const rows: string[][] = [];
  for await (const row of parseCsvStream(source)) rows.push(row);
  return rows;
}

describe("parseCsvStream: gramática RFC 4180 básica", () => {
  it("filas simples separadas por comas y saltos de línea", async () => {
    expect(await collectRows("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("campos entre comillas con comas dentro", async () => {
    expect(await collectRows('nombre,precio\n"Auriculares, edición especial",19.99\n')).toEqual([
      ["nombre", "precio"],
      ["Auriculares, edición especial", "19.99"],
    ]);
  });

  it("campos entre comillas con saltos de línea dentro", async () => {
    expect(await collectRows('nombre,descripcion\n"Producto","Línea uno\nLínea dos"\n')).toEqual([
      ["nombre", "descripcion"],
      ["Producto", "Línea uno\nLínea dos"],
    ]);
  });

  it("comillas escapadas ( dobles) dentro de un campo entre comillas", async () => {
    expect(await collectRows('nombre\n"Pantalla de 24\'\' ""Full HD"""\n')).toEqual([["nombre"], [`Pantalla de 24'' "Full HD"`]]);
  });

  it("CRLF y LF indistintamente, incluso mezclados en el mismo contenido", async () => {
    expect(await collectRows("a,b\r\n1,2\n3,4\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("caracteres Unicode (acentos, eñes, emoji, CJK) se preservan intactos", async () => {
    expect(await collectRows('nombre\n"Cámara réflex 📷 — 日本語"\n')).toEqual([["nombre"], ["Cámara réflex 📷 — 日本語"]]);
  });

  it("quita la marca UTF-8 BOM inicial si existe", async () => {
    expect(await collectRows("﻿a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("filas completamente vacías (líneas en blanco) se omiten, no se emiten como fila", async () => {
    expect(await collectRows("a,b\n1,2\n\n\n3,4\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("la última fila se emite aunque el contenido no termine en salto de línea", async () => {
    expect(await collectRows("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("entrada vacía no emite ninguna fila", async () => {
    expect(await collectRows("")).toEqual([]);
  });
});

describe("parseCsvStream: procesamiento incremental real (fragmentos pequeños, límites arbitrarios)", () => {
  const content = 'a,b,c\n"uno, con coma",2,"tres\ncon salto"\n4,5,6\n';
  const expected = [
    ["a", "b", "c"],
    ["uno, con coma", "2", "tres\ncon salto"],
    ["4", "5", "6"],
  ];

  it("produce el mismo resultado con un único fragmento que con fragmentos de 1 carácter cada uno", async () => {
    expect(await collectRows(content, 1)).toEqual(expected);
  });

  it("produce el mismo resultado con fragmentos de tamaños intermedios (3, 7, 16 caracteres)", async () => {
    for (const size of [3, 7, 16]) {
      expect(await collectRows(content, size)).toEqual(expected);
    }
  });

  it('una comilla escapada ("") partida exactamente en el límite entre dos fragmentos se interpreta correctamente', async () => {
    // 'x""y' partido de forma que un fragmento termine justo en la primera
    // comilla y el siguiente empiece en la segunda — el caso límite que
    // motiva el estado "justClosedQuote" del tokenizador.
    const raw = 'nombre\n"x""y"\n';
    const splitPoint = raw.indexOf('""') + 1; // corta entre las dos comillas del escape
    async function* twoChunks() {
      yield raw.slice(0, splitPoint);
      yield raw.slice(splitPoint);
    }
    const rows: string[][] = [];
    for await (const row of parseCsvStream(twoChunks())) rows.push(row);
    expect(rows).toEqual([["nombre"], ['x"y']]);
  });

  it("un CRLF partido exactamente entre el \\r y el \\n (en fragmentos distintos) no genera una fila en blanco de más", async () => {
    async function* twoChunks() {
      yield "a,b\r";
      yield "\n1,2\r\n";
    }
    const rows: string[][] = [];
    for await (const row of parseCsvStream(twoChunks())) rows.push(row);
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseCsvStream: truncamiento y fallos de lectura — nunca se trata como una descarga completa", () => {
  it("lanza StreamingCsvTruncatedError si el contenido termina con un campo entre comillas sin cerrar", async () => {
    async function* source() {
      yield 'a,b\n"esto no se cierra nunca';
    }
    await expect(async () => {
      for await (const _ of parseCsvStream(source())) void _;
    }).rejects.toThrow(StreamingCsvTruncatedError);
  });

  it("lanza StreamingCsvTruncatedError si el iterable de fragmentos lanza a mitad (fallo de red simulado)", async () => {
    async function* source() {
      yield "a,b\n1,2\n";
      throw new Error("fallo de red simulado a mitad de la descarga");
    }
    await expect(async () => {
      for await (const _ of parseCsvStream(source())) void _;
    }).rejects.toThrow(StreamingCsvTruncatedError);
  });

  it("las filas completas ANTES del truncamiento no se pierden silenciosamente: se pueden recoger hasta el punto de fallo antes de que se propague la excepción", async () => {
    async function* source() {
      yield "a,b\n1,2\n3,4\n";
      throw new Error("fallo de red simulado a mitad de la descarga");
    }
    const rows: string[][] = [];
    await expect(async () => {
      for await (const row of parseCsvStream(source())) rows.push(row);
    }).rejects.toThrow(StreamingCsvTruncatedError);
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });
});

describe("csvRecordStream: cabecera + registros incrementales", () => {
  it("usa la primera fila como cabecera y numera las filas de datos en base 1", async () => {
    const results: { record: Record<string, string>; rowNumber: number }[] = [];
    for await (const item of csvRecordStream(singleChunk("nombre,precio\nA,10\nB,20\n"))) {
      results.push({ record: item.record, rowNumber: item.rowNumber });
    }
    expect(results).toEqual([
      { record: { nombre: "A", precio: "10" }, rowNumber: 1 },
      { record: { nombre: "B", precio: "20" }, rowNumber: 2 },
    ]);
  });

  it("recorta espacios de la cabecera y de cada valor", async () => {
    const results: Record<string, string>[] = [];
    for await (const item of csvRecordStream(singleChunk(" nombre , precio \n A , 10 \n"))) {
      results.push(item.record);
    }
    expect(results).toEqual([{ nombre: "A", precio: "10" }]);
  });

  it("una fila con menos columnas que la cabecera rellena las que faltan con cadena vacía, sin lanzar", async () => {
    const results: Record<string, string>[] = [];
    for await (const item of csvRecordStream(singleChunk("a,b,c\n1,2\n"))) results.push(item.record);
    expect(results).toEqual([{ a: "1", b: "2", c: "" }]);
  });

  it("un feed sin ninguna fila de datos (solo cabecera) no produce ningún registro", async () => {
    const results: Record<string, string>[] = [];
    for await (const item of csvRecordStream(singleChunk("a,b,c\n"))) results.push(item.record);
    expect(results).toEqual([]);
  });

  it("un feed vacío (sin cabecera ni datos) no produce ningún registro", async () => {
    const results: Record<string, string>[] = [];
    for await (const item of csvRecordStream(singleChunk(""))) results.push(item.record);
    expect(results).toEqual([]);
  });
});
