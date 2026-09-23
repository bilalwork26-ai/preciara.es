import { describe, expect, it } from "vitest";
import { serializeJsonLd } from "./jsonLd";

describe("serializeJsonLd", () => {
  it("produce JSON válido para un objeto normal", () => {
    const json = serializeJsonLd({ a: 1, b: "texto" });
    expect(JSON.parse(json)).toEqual({ a: 1, b: "texto" });
  });

  it("escapa '<' para que un </script> dentro de un valor (p. ej. un nombre de producto de un feed externo) nunca cierre la etiqueta", () => {
    const json = serializeJsonLd({ name: "Producto</script><script>alert(1)</script>" });
    expect(json).not.toContain("</script>");
    expect(json).toContain("\\u003c/script>");
    // Sigue siendo JSON válido tras el escape.
    expect(JSON.parse(json)).toEqual({ name: "Producto</script><script>alert(1)</script>" });
  });
});
