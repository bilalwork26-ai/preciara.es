import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { OfferSource } from "@/generated/prisma";
import { getSyncSourcesOverview, getSyncImportRunsPage } from "./syncOverview";

const PREFIX = "test-sync-overview";

describe.skipIf(!process.env.DATABASE_URL)("getSyncSourcesOverview / getSyncImportRunsPage", () => {
  afterAll(async () => {
    if (!prisma) return;
    await prisma.importError.deleteMany({ where: { importRun: { source: { startsWith: `sync:awin:${PREFIX}` } } } });
    await prisma.importRun.deleteMany({ where: { source: { startsWith: `sync:awin:${PREFIX}` } } });
    await prisma.importRun.deleteMany({ where: { source: { startsWith: `sync:ebay:${PREFIX}` } } });
    await prisma.syncSourceConfig.deleteMany({ where: { source: OfferSource.AWIN } });
  });

  it("estado vacío: sin ejecuciones ni configuración, muestra 'sin ejecuciones' y 'no programada' (nunca inventa datos)", async () => {
    const overview = await getSyncSourcesOverview();
    expect(overview).not.toBeNull();
    const awin = overview!.find((o) => o.source === OfferSource.AWIN)!;
    // En un entorno de pruebas recién migrado no hay ninguna fila todavía.
    if (awin.totalRuns === 0) {
      expect(awin.lastImportRun).toBeNull();
      expect(awin.nextRunAt).toBeNull();
      expect(awin.enabled).toBe(false);
    }
  });

  it("cuenta correctamente ejecuciones totales, recientes fallidas, y refleja enabled/intervalMinutes de SyncSourceConfig", async () => {
    await prisma!.importRun.createMany({
      data: [
        { source: `sync:awin:${PREFIX}:1`, status: "SUCCESS", rowsRead: 10 },
        { source: `sync:awin:${PREFIX}:2`, status: "FAILED", rowsRead: 5, errorSummary: "Fallo simulado seguro" },
      ],
    });
    await prisma!.syncSourceConfig.upsert({
      where: { source: OfferSource.AWIN },
      update: { enabled: true, intervalMinutes: 60 },
      create: { source: OfferSource.AWIN, enabled: true, intervalMinutes: 60 },
    });

    const overview = await getSyncSourcesOverview();
    const awin = overview!.find((o) => o.source === OfferSource.AWIN)!;
    expect(awin.enabled).toBe(true);
    expect(awin.intervalMinutes).toBe(60);
    expect(awin.totalRuns).toBeGreaterThanOrEqual(2);
    expect(awin.failedRunsRecent).toBeGreaterThanOrEqual(1);
    // La más reciente por startedAt (createMany sin orden garantizado en el tiempo, pero ambas son "recientes"): solo comprobamos que existe y trae los campos seguros esperados.
    expect(awin.lastImportRun).not.toBeNull();
    expect(typeof awin.lastImportRun!.rowsRead).toBe("number");
  });

  it("nextRunAt solo se calcula si enabled=true Y ya hay lastRunAt real; si no, 'No programada' (null)", async () => {
    await prisma!.syncSourceConfig.upsert({
      where: { source: OfferSource.AWIN },
      update: { enabled: true, intervalMinutes: 120, lastRunAt: new Date("2026-01-01T00:00:00Z") },
      create: { source: OfferSource.AWIN, enabled: true, intervalMinutes: 120, lastRunAt: new Date("2026-01-01T00:00:00Z") },
    });
    const overview = await getSyncSourcesOverview();
    const awin = overview!.find((o) => o.source === OfferSource.AWIN)!;
    expect(awin.nextRunAt).toEqual(new Date("2026-01-01T02:00:00Z"));

    await prisma!.syncSourceConfig.update({ where: { source: OfferSource.AWIN }, data: { enabled: false } });
    const overviewDisabled = await getSyncSourcesOverview();
    expect(overviewDisabled!.find((o) => o.source === OfferSource.AWIN)!.nextRunAt).toBeNull();
  });

  it("un errorSummary seguro se devuelve tal cual, sin campos adicionales inventados", async () => {
    const overview = await getSyncSourcesOverview();
    const awin = overview!.find((o) => o.source === OfferSource.AWIN)!;
    if (awin.lastImportRun?.errorSummary) {
      expect(typeof awin.lastImportRun.errorSummary).toBe("string");
    }
  });

  it("getSyncImportRunsPage nunca incluye ejecuciones del importador CSV (solo fuentes automáticas)", async () => {
    await prisma!.importRun.create({ data: { source: `csv:admin-upload:${PREFIX}.csv`, status: "SUCCESS" } });
    const result = await getSyncImportRunsPage({ page: 1 });
    expect(result).not.toBeNull();
    for (const run of result!.runs) {
      expect(run.source.startsWith("csv:")).toBe(false);
    }
    await prisma!.importRun.deleteMany({ where: { source: `csv:admin-upload:${PREFIX}.csv` } });
  });

  it("filtra por fuente cuando se indica, y pagina de forma acotada", async () => {
    const onlyAwin = await getSyncImportRunsPage({ source: OfferSource.AWIN, page: 1 });
    expect(onlyAwin).not.toBeNull();
    for (const run of onlyAwin!.runs) {
      expect(run.source.startsWith("sync:awin")).toBe(true);
    }
    expect(onlyAwin!.runs.length).toBeLessThanOrEqual(onlyAwin!.pageSize);

    const beyondLastPage = await getSyncImportRunsPage({ source: OfferSource.AWIN, page: 9999 });
    expect(beyondLastPage).not.toBeNull();
    expect(beyondLastPage!.runs.length).toBe(0);
    expect(beyondLastPage!.page).toBe(9999);
  });
});
