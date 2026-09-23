import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { OfferSource } from "@/generated/prisma";
import { getSyncSourceConfig, isSyncDue, recordSyncSourceRun, upsertSyncSourceConfig } from "./syncSourceConfig";

describe("isSyncDue (pura, sin BD)", () => {
  it("nunca está due si enabled es false, aunque nunca se haya ejecutado", () => {
    expect(isSyncDue({ source: OfferSource.AWIN, intervalMinutes: 60, enabled: false, lastRunAt: null })).toBe(false);
  });

  it("está due si enabled y nunca se ha ejecutado", () => {
    expect(isSyncDue({ source: OfferSource.AWIN, intervalMinutes: 60, enabled: true, lastRunAt: null })).toBe(true);
  });

  it("no está due si el intervalo todavía no ha pasado", () => {
    const lastRunAt = new Date(Date.now() - 10 * 60_000); // hace 10 min
    expect(isSyncDue({ source: OfferSource.AWIN, intervalMinutes: 60, enabled: true, lastRunAt }, new Date())).toBe(false);
  });

  it("está due si el intervalo ya pasó", () => {
    const lastRunAt = new Date(Date.now() - 90 * 60_000); // hace 90 min
    expect(isSyncDue({ source: OfferSource.AWIN, intervalMinutes: 60, enabled: true, lastRunAt }, new Date())).toBe(true);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("syncSourceConfig (integración, BD local de pruebas)", () => {
  afterEach(async () => {
    if (!prisma) return;
    await prisma.syncSourceConfig.deleteMany({ where: { source: OfferSource.EBAY } });
  });

  it("sin fila todavía, devuelve 'desactivada' por defecto en vez de null o error", async () => {
    const config = await getSyncSourceConfig(OfferSource.EBAY);
    expect(config).toEqual({ source: OfferSource.EBAY, intervalMinutes: 1440, enabled: false, lastRunAt: null });
  });

  it("upsertSyncSourceConfig crea y luego actualiza la misma fila (idempotente por fuente)", async () => {
    await upsertSyncSourceConfig({ source: OfferSource.EBAY, intervalMinutes: 120, enabled: true });
    let config = await getSyncSourceConfig(OfferSource.EBAY);
    expect(config).toMatchObject({ intervalMinutes: 120, enabled: true });

    await upsertSyncSourceConfig({ source: OfferSource.EBAY, intervalMinutes: 240, enabled: false });
    config = await getSyncSourceConfig(OfferSource.EBAY);
    expect(config).toMatchObject({ intervalMinutes: 240, enabled: false });

    const rows = await prisma!.syncSourceConfig.findMany({ where: { source: OfferSource.EBAY } });
    expect(rows).toHaveLength(1); // nunca duplica la fila de esa fuente
  });

  it("recordSyncSourceRun actualiza lastRunAt sin tocar enabled/intervalMinutes existentes", async () => {
    await upsertSyncSourceConfig({ source: OfferSource.EBAY, intervalMinutes: 90, enabled: true });
    const at = new Date("2026-01-01T00:00:00Z");
    await recordSyncSourceRun(OfferSource.EBAY, at);
    const config = await getSyncSourceConfig(OfferSource.EBAY);
    expect(config?.lastRunAt?.toISOString()).toBe(at.toISOString());
    expect(config?.intervalMinutes).toBe(90);
    expect(config?.enabled).toBe(true);
  });
});
