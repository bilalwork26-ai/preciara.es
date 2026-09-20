import { describe, expect, it } from "vitest";
import { sanitizeErrorMessage } from "./sanitizeError";

describe("sanitizeErrorMessage", () => {
  it("oculta una cadena de conexión completa con usuario y contraseña", () => {
    const msg = sanitizeErrorMessage("Can't reach database server at mysql://root:supersecreta@localhost:3306/preciara");
    expect(msg).not.toContain("supersecreta");
    expect(msg).toContain("[url-oculta]");
  });

  it("no toca un mensaje sin URL", () => {
    expect(sanitizeErrorMessage("Access denied for user 'root'@'localhost'")).toBe(
      "Access denied for user 'root'@'localhost'"
    );
  });

  it("oculta varias URLs en el mismo mensaje", () => {
    const msg = sanitizeErrorMessage("de mysql://a:b@host1/db a mysql://c:d@host2/db2");
    expect(msg).not.toContain("a:b");
    expect(msg).not.toContain("c:d");
  });
});
