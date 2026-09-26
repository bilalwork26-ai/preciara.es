import { afterEach, describe, expect, it, vi } from "vitest";
import { getContactEmail } from "./contact";

describe("getContactEmail: lectura segura de NEXT_PUBLIC_CONTACT_EMAIL", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("devuelve el correo (sin espacios sobrantes) cuando la variable es un correo válido", () => {
    vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", "contacto@preciara.es");
    expect(getContactEmail()).toBe("contacto@preciara.es");
  });

  it("recorta espacios alrededor del valor antes de validar", () => {
    vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", "  contacto@preciara.es  ");
    expect(getContactEmail()).toBe("contacto@preciara.es");
  });

  it("devuelve null cuando la variable no está definida, sin lanzar", () => {
    vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", undefined);
    expect(() => getContactEmail()).not.toThrow();
    expect(getContactEmail()).toBeNull();
  });

  it("devuelve null para una cadena vacía o solo espacios", () => {
    vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", "");
    expect(getContactEmail()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", "   ");
    expect(getContactEmail()).toBeNull();
  });

  it("devuelve null para valores que no tienen forma de correo (sin @, sin dominio, con espacios internos)", () => {
    for (const invalid of ["no-es-un-correo", "falta-dominio@", "@sin-usuario.com", "con espacio@preciara.es", "doble@@preciara.es"]) {
      vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", invalid);
      expect(getContactEmail()).toBeNull();
    }
  });

  it("nunca inventa ni devuelve un correo por defecto: sin variable, siempre null, nunca una dirección de ejemplo", () => {
    vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", undefined);
    expect(getContactEmail()).toBeNull();
  });
});
