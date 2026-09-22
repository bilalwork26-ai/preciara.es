import { describe, expect, it } from "vitest";
import { validateMarketplaceAccountDeletionPayload } from "./payloadValidation";

describe("validateMarketplaceAccountDeletionPayload", () => {
  it("acepta un JSON válido con metadata.topic === MARKETPLACE_ACCOUNT_DELETION", () => {
    const body = JSON.stringify({ metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION" }, notification: { data: {} } });
    expect(validateMarketplaceAccountDeletionPayload(body)).toEqual({ valid: true });
  });

  it("acepta cualquier metadata.schemaVersion (nunca se fija a '1.0', para no romper versiones compatibles futuras)", () => {
    const v1 = JSON.stringify({ metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION", schemaVersion: "1.0" }, notification: {} });
    const v2 = JSON.stringify({ metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION", schemaVersion: "2.3" }, notification: {} });
    const sinVersion = JSON.stringify({ metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION" }, notification: {} });
    expect(validateMarketplaceAccountDeletionPayload(v1)).toEqual({ valid: true });
    expect(validateMarketplaceAccountDeletionPayload(v2)).toEqual({ valid: true });
    expect(validateMarketplaceAccountDeletionPayload(sinVersion)).toEqual({ valid: true });
  });

  it("rechaza un cuerpo que no es JSON válido: reason invalid_json", () => {
    expect(validateMarketplaceAccountDeletionPayload("esto no es json {")).toEqual({ valid: false, reason: "invalid_json" });
    expect(validateMarketplaceAccountDeletionPayload("")).toEqual({ valid: false, reason: "invalid_json" });
  });

  it("rechaza un JSON válido con un topic distinto: reason wrong_topic", () => {
    const body = JSON.stringify({ metadata: { topic: "PRIORITY_LISTING_REVISION" }, notification: {} });
    expect(validateMarketplaceAccountDeletionPayload(body)).toEqual({ valid: false, reason: "wrong_topic" });
  });

  it("rechaza un JSON válido sin metadata en absoluto: reason wrong_topic", () => {
    expect(validateMarketplaceAccountDeletionPayload(JSON.stringify({ notification: {} }))).toEqual({ valid: false, reason: "wrong_topic" });
  });

  it("rechaza un JSON válido cuyo metadata no es un objeto: reason wrong_topic", () => {
    expect(validateMarketplaceAccountDeletionPayload(JSON.stringify({ metadata: "MARKETPLACE_ACCOUNT_DELETION" }))).toEqual({
      valid: false,
      reason: "wrong_topic",
    });
    expect(validateMarketplaceAccountDeletionPayload(JSON.stringify({ metadata: null }))).toEqual({ valid: false, reason: "wrong_topic" });
  });

  it("rechaza JSON que no es un objeto en la raíz (array, string, número): reason wrong_topic", () => {
    expect(validateMarketplaceAccountDeletionPayload(JSON.stringify(["MARKETPLACE_ACCOUNT_DELETION"]))).toEqual({
      valid: false,
      reason: "wrong_topic",
    });
    expect(validateMarketplaceAccountDeletionPayload(JSON.stringify("MARKETPLACE_ACCOUNT_DELETION"))).toEqual({
      valid: false,
      reason: "wrong_topic",
    });
    expect(validateMarketplaceAccountDeletionPayload(JSON.stringify(42))).toEqual({ valid: false, reason: "wrong_topic" });
  });

  it("es estrictamente sensible a mayúsculas/minúsculas y no admite coincidencias parciales del topic", () => {
    const lowercased = JSON.stringify({ metadata: { topic: "marketplace_account_deletion" } });
    const partial = JSON.stringify({ metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION_EXTRA" } });
    expect(validateMarketplaceAccountDeletionPayload(lowercased)).toEqual({ valid: false, reason: "wrong_topic" });
    expect(validateMarketplaceAccountDeletionPayload(partial)).toEqual({ valid: false, reason: "wrong_topic" });
  });
});
