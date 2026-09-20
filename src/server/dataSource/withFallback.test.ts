import { describe, expect, it, vi } from "vitest";
import { resolveWithFallback } from "./withFallback";

describe("resolveWithFallback", () => {
  it("usa la base de datos cuando la consulta devuelve datos suficientes", async () => {
    const result = await resolveWithFallback({
      fetchFromDb: async () => ["real-1", "real-2"],
      demoFallback: ["demo-1"],
    });
    expect(result).toEqual({ data: ["real-1", "real-2"], source: "database" });
  });

  it("usa el fallback demo cuando fetchFromDb devuelve null (BD no configurada o error)", async () => {
    const result = await resolveWithFallback({
      fetchFromDb: async () => null,
      demoFallback: ["demo-1", "demo-2"],
    });
    expect(result).toEqual({ data: ["demo-1", "demo-2"], source: "demo" });
  });

  it("usa el fallback demo cuando la BD responde con un array vacío (regla por defecto)", async () => {
    const result = await resolveWithFallback({
      fetchFromDb: async () => [],
      demoFallback: ["demo-1"],
    });
    expect(result).toEqual({ data: ["demo-1"], source: "demo" });
  });

  it("nunca mezcla datos reales y demo: el resultado es siempre uno u otro completo", async () => {
    const dbData = { products: ["real-a", "real-b"], merchants: ["merchant-real"] };
    const demoData = { products: ["demo-a"], merchants: ["merchant-demo"] };

    const withData = await resolveWithFallback({
      fetchFromDb: async () => dbData,
      demoFallback: demoData,
      isSufficient: (d) => d.products.length > 0,
    });
    expect(withData.data).toBe(dbData);
    expect(withData.data).not.toBe(demoData);

    const empty = await resolveWithFallback({
      fetchFromDb: async () => ({ products: [], merchants: [] }),
      demoFallback: demoData,
      isSufficient: (d) => d.products.length > 0,
    });
    expect(empty.data).toBe(demoData);
    expect(empty.data).not.toBe(dbData);
  });

  it("respeta un criterio isSufficient personalizado", async () => {
    const result = await resolveWithFallback({
      fetchFromDb: async () => ({ count: 0 }),
      demoFallback: { count: -1 },
      isSufficient: (d) => d.count > 0,
    });
    expect(result.source).toBe("demo");
  });

  it("no llama a fetchFromDb más de una vez (una sola consulta por resolución)", async () => {
    const fetchFromDb = vi.fn(async () => ["x"]);
    await resolveWithFallback({ fetchFromDb, demoFallback: [] });
    expect(fetchFromDb).toHaveBeenCalledTimes(1);
  });
});
