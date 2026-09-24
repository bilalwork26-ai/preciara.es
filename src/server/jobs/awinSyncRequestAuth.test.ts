import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AWIN_SYNC_SIGNATURE_MAX_AGE_SECONDS, verifyAwinSyncSignature } from "./awinSyncRequestAuth";

const SECRET = "clave-de-prueba-que-nunca-sale-a-red";
const NOW_MS = Date.UTC(2026, 8, 24, 16, 0, 0);
const TIMESTAMP = String(Math.floor(NOW_MS / 1000));
const BODY = JSON.stringify({ dryRun: true });

function sign(timestamp: string, body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

describe("verifyAwinSyncSignature", () => {
  it("acepta una firma correcta y reciente", () => {
    expect(
      verifyAwinSyncSignature({
        secret: SECRET,
        timestamp: TIMESTAMP,
        signature: sign(TIMESTAMP, BODY),
        body: BODY,
        nowMs: NOW_MS,
      })
    ).toBe(true);
  });

  it("rechaza una firma creada con otra clave", () => {
    expect(
      verifyAwinSyncSignature({
        secret: SECRET,
        timestamp: TIMESTAMP,
        signature: sign(TIMESTAMP, BODY, "otra-clave"),
        body: BODY,
        nowMs: NOW_MS,
      })
    ).toBe(false);
  });

  it("la firma cubre el cuerpo exacto y no permite cambiar dryRun", () => {
    expect(
      verifyAwinSyncSignature({
        secret: SECRET,
        timestamp: TIMESTAMP,
        signature: sign(TIMESTAMP, BODY),
        body: JSON.stringify({ dryRun: false }),
        nowMs: NOW_MS,
      })
    ).toBe(false);
  });

  it("rechaza peticiones expiradas para impedir su reutilización", () => {
    const staleNow = NOW_MS + (AWIN_SYNC_SIGNATURE_MAX_AGE_SECONDS + 1) * 1000;
    expect(
      verifyAwinSyncSignature({
        secret: SECRET,
        timestamp: TIMESTAMP,
        signature: sign(TIMESTAMP, BODY),
        body: BODY,
        nowMs: staleNow,
      })
    ).toBe(false);
  });

  it.each([
    ["sin timestamp", null, sign(TIMESTAMP, BODY)],
    ["sin firma", TIMESTAMP, null],
    ["timestamp no numérico", "ayer", sign(TIMESTAMP, BODY)],
    ["firma con formato incorrecto", TIMESTAMP, "no-es-hex"],
  ])("rechaza %s", (_label, timestamp, signature) => {
    expect(verifyAwinSyncSignature({ secret: SECRET, timestamp, signature, body: BODY, nowMs: NOW_MS })).toBe(false);
  });
});
