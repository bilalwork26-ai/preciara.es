import { describe, expect, it } from "vitest";
import { InvalidDeactivateStaleAfterHoursError, MAX_DEACTIVATE_STALE_AFTER_HOURS, readDeactivateStaleAfterHours } from "./deactivationConfig";

describe("readDeactivateStaleAfterHours", () => {
  it("variable ausente devuelve undefined (opción más segura por defecto)", () => {
    expect(readDeactivateStaleAfterHours({})).toBeUndefined();
  });

  it("variable vacía o solo espacios devuelve undefined", () => {
    expect(readDeactivateStaleAfterHours({ AWIN_DEACTIVATE_STALE_AFTER_HOURS: "" })).toBeUndefined();
    expect(readDeactivateStaleAfterHours({ AWIN_DEACTIVATE_STALE_AFTER_HOURS: "   " })).toBeUndefined();
  });

  it("valores válidos (positivos, hasta el máximo) se devuelven tal cual", () => {
    expect(readDeactivateStaleAfterHours({ AWIN_DEACTIVATE_STALE_AFTER_HOURS: "72" })).toBe(72);
    expect(readDeactivateStaleAfterHours({ AWIN_DEACTIVATE_STALE_AFTER_HOURS: "1" })).toBe(1);
    expect(readDeactivateStaleAfterHours({ AWIN_DEACTIVATE_STALE_AFTER_HOURS: String(MAX_DEACTIVATE_STALE_AFTER_HOURS) })).toBe(MAX_DEACTIVATE_STALE_AFTER_HOURS);
  });

  it.each([
    ["cero", "0"],
    ["negativo", "-5"],
    ["no numérico", "hola"],
    ["NaN literal", "NaN"],
    ["infinito", "Infinity"],
    ["excesivo (más de un año)", String(MAX_DEACTIVATE_STALE_AFTER_HOURS + 1)],
  ] as const)("%s se rechaza con InvalidDeactivateStaleAfterHoursError", (_label, value) => {
    let caught: unknown;
    try {
      readDeactivateStaleAfterHours({ AWIN_DEACTIVATE_STALE_AFTER_HOURS: value });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidDeactivateStaleAfterHoursError);
    expect((caught as InvalidDeactivateStaleAfterHoursError).code).toBe("INVALID_DEACTIVATE_STALE_AFTER_HOURS");
  });
});
