import { describe, expect, it } from "vitest";
import { parseCsv, csvRowsToRecords } from "./csv";

describe("parseCsv", () => {
  it("parses simple comma-separated rows", () => {
    const rows = parseCsv("a,b,c\n1,2,3\n");
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields containing commas", () => {
    const rows = parseCsv('a,b\n"1,234","hola"\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["1,234", "hola"],
    ]);
  });

  it("handles escaped double quotes inside quoted fields", () => {
    const rows = parseCsv('a\n"dice ""hola"""\n');
    expect(rows).toEqual([["a"], ['dice "hola"']]);
  });

  it("handles quoted fields with embedded newlines", () => {
    const rows = parseCsv('a,b\n"linea1\nlinea2",x\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["linea1\nlinea2", "x"],
    ]);
  });

  it("handles CRLF line endings", () => {
    const rows = parseCsv("a,b\r\n1,2\r\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips a leading UTF-8 BOM", () => {
    const rows = parseCsv("﻿a,b\n1,2\n");
    expect(rows[0]).toEqual(["a", "b"]);
  });

  it("handles a final row without a trailing newline", () => {
    const rows = parseCsv("a,b\n1,2");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("ignores a fully blank trailing line", () => {
    const rows = parseCsv("a,b\n1,2\n\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("csvRowsToRecords", () => {
  it("maps rows to objects keyed by the header row", () => {
    const { header, records } = csvRowsToRecords([
      ["name", "price"],
      ["Foo", "9.99"],
      ["Bar", "19.99"],
    ]);
    expect(header).toEqual(["name", "price"]);
    expect(records).toEqual([
      { name: "Foo", price: "9.99" },
      { name: "Bar", price: "19.99" },
    ]);
  });

  it("returns empty header/records for an empty input", () => {
    expect(csvRowsToRecords([])).toEqual({ header: [], records: [] });
  });

  it("fills missing trailing columns with empty strings", () => {
    const { records } = csvRowsToRecords([
      ["a", "b", "c"],
      ["1"],
    ]);
    expect(records).toEqual([{ a: "1", b: "", c: "" }]);
  });
});
