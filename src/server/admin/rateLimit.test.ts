import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearLoginFailures, isLoginLocked, recordLoginFailure } from "./rateLimit";

describe("admin login rate limiting", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("no bloquea antes de agotar los intentos", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 4; i++) recordLoginFailure(key);
    expect(isLoginLocked(key)).toBe(false);
  });

  it("bloquea tras agotar los intentos permitidos", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) recordLoginFailure(key);
    expect(isLoginLocked(key)).toBe(true);
  });

  it("un login correcto limpia los fallos previos", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 4; i++) recordLoginFailure(key);
    clearLoginFailures(key);
    recordLoginFailure(key);
    expect(isLoginLocked(key)).toBe(false);
  });

  it("claves distintas no se afectan entre sí", () => {
    const keyA = `test-a-${Math.random()}`;
    const keyB = `test-b-${Math.random()}`;
    for (let i = 0; i < 5; i++) recordLoginFailure(keyA);
    expect(isLoginLocked(keyA)).toBe(true);
    expect(isLoginLocked(keyB)).toBe(false);
  });
});
