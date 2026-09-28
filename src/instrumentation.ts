/**
 * Programador en proceso de la sincronización de Awin — dos veces al día,
 * SIN depender de `after()` (ver `src/app/api/jobs/awin-sync/route.ts`).
 *
 * Contexto: un ciclo real accionado por GitHub Actions (HTTP 202 aceptado,
 * `after()` programado) no dejó NINGÚN rastro en los logs de Hostinger —
 * ni éxito, ni fallo, ni bloqueo. La documentación oficial de Next.js
 * (`node_modules/next/dist/docs/01-app/02-guides/self-hosting.md`) exige
 * que la plataforma de hosting conceda un margen de apagado ordenado
 * (10-30 s) para que un `after()` pendiente termine al reciclar el
 * proceso — no hay garantía de que Hostinger lo respete, y no hay forma
 * de comprobarlo desde este repositorio. Este fichero evita depender de
 * esa garantía: `register()` (la convención `instrumentation.ts` de
 * Next.js, estable desde la v15.0.0, ver la misma carpeta de docs
 * vendida) se ejecuta EXACTAMENTE UNA VEZ al arrancar el proceso del
 * servidor (`next start`), sin depender de ninguna petición HTTP
 * entrante, y programa un `setTimeout` que llama DIRECTAMENTE a
 * `runAwinCatalogSyncCycle()` — el mismo orquestador que ya usan
 * `route.ts` y `scripts/sync-awin.ts`, sin reimplementar ni duplicar su
 * lógica.
 *
 * Esto NO es una garantía absoluta: si Hostinger recicla el proceso
 * justo durante una sincronización, el trabajo se pierde igual que con
 * `after()` — la diferencia es que la ventana de exposición pasa de
 * "cualquier petición HTTP entrante en cualquier momento" a dos
 * instantes fijos y predecibles al día, lo que reduce mucho el riesgo
 * práctico sin eliminarlo del todo.
 *
 * Horarios: EXACTAMENTE los mismos que ya usa
 * `.github/workflows/awin-catalog-sync.yml` (`cron: "17 4 * * *"` /
 * `cron: "17 16 * * *"`, ambos en UTC — el cron de GitHub Actions siempre
 * es UTC) — reutilizados tal cual, nunca inventados aquí. El disparador
 * HTTP de GitHub Actions NO se desactiva con este cambio: ambos caminos
 * pueden coexistir con seguridad porque `runAwinCatalogSyncCycle()` ya
 * adquiere su propio bloqueo distribuido (`AWIN_CYCLE_LOCK_NAME`, ver
 * `awinOrchestrator.ts`) — si los dos coincidieran, uno de los dos
 * terminaría en `awin_sync_lock_busy` sin corromper nada. Ese mismo
 * bloqueo es también lo que hace seguro este programador si Hostinger
 * llegara a ejecutar más de una instancia del proceso: `register()`
 * correría en cada una, pero como mucho una ejecución real ganaría el
 * bloqueo por ciclo.
 *
 * Cerrado por defecto: `register()` no hace NADA si el runtime no es
 * Node (nunca Edge) o si `AWIN_DATAFEED_API_KEY` no está configurada —
 * mismo criterio "cerrado por defecto" que ya usa `route.ts`, así nunca
 * se activa sin querer en local/dev/preview. Nunca ejecuta un ciclo
 * inmediatamente al arrancar: solo programa la SIGUIENTE hora que
 * corresponda (`computeMsUntilNextRun`).
 *
 * Nunca solapa ejecuciones dentro del mismo proceso: cada ejecución se
 * reprograma a sí misma DESPUÉS de terminar (éxito o fallo, en un
 * `finally`) — nunca con `setInterval`, que podría solapar si un ciclo
 * tardara más que el intervalo. Un fallo de un ciclo nunca detiene el
 * programador ni tumba el proceso de Next.js: `runScheduledAwinSync`
 * captura cualquier error internamente (igual que `after()` en
 * `route.ts` y el `catch` de `scripts/sync-awin.ts`) y el `finally` de
 * `scheduleNextAwinSync` reprograma la siguiente ejecución pase lo que
 * pase.
 *
 * Este fichero NUNCA toca `awinFeedListParser.ts`, `awinOrchestrator.ts`,
 * `syncRun.ts` ni Prisma directamente — solo llama a
 * `runAwinCatalogSyncCycle()` con los mismos parámetros que ya usa
 * `route.ts`, y registra el mismo tipo de evento de log.
 */
import {
  AwinOrchestratorLockBusyError,
  runAwinCatalogSyncCycle,
  summarizeAwinFeedFailures,
  type AwinOrchestratorSummary,
} from "@/server/catalogSync/awinOrchestrator";
import { InvalidDeactivateStaleAfterHoursError, readDeactivateStaleAfterHours } from "@/server/catalogSync/deactivationConfig";

/**
 * Mismos dos horarios diarios (hora UTC) que
 * `.github/workflows/awin-catalog-sync.yml` — NUNCA se inventan aquí, se
 * copian tal cual del cron ya existente.
 */
const DAILY_UTC_TIMES: ReadonlyArray<{ hour: number; minute: number }> = [
  { hour: 4, minute: 17 },
  { hour: 16, minute: 17 },
];

/**
 * Milisegundos desde `now` hasta la próxima hora de `times` (en UTC) que
 * corresponda — hoy si todavía no ha pasado ninguna, o la primera de
 * mañana si ya han pasado todas. Función pura, sin efectos secundarios,
 * para poder probarla sin temporizadores reales.
 *
 * ESTRICTAMENTE posterior a `now` (nunca `>=`): justo después de disparar
 * una ejecución, `scheduleNextAwinSync` vuelve a llamar a esta función en
 * el MISMO instante exacto (0 ms transcurridos) para programar la
 * siguiente — con `>=`, ese mismo instante volvería a calificar como "la
 * hora ya tocada" y produciría un segundo disparo inmediato duplicado
 * cada día. Con `>` estricto, ese instante ya cuenta como pasado y se
 * salta correctamente al siguiente horario (o a mañana).
 */
export function computeMsUntilNextRun(now: Date, times: ReadonlyArray<{ hour: number; minute: number }>): number {
  const todayMidnightUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const candidatesMs = times.map((t) => todayMidnightUtc + t.hour * 60 * 60 * 1000 + t.minute * 60 * 1000);
  const nowMs = now.getTime();
  const todayRemaining = candidatesMs.filter((c) => c > nowMs);
  if (todayRemaining.length > 0) return Math.min(...todayRemaining) - nowMs;
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  return Math.min(...candidatesMs) + ONE_DAY_MS - nowMs;
}

/**
 * Nunca deja que un valor inválido de `AWIN_DEACTIVATE_STALE_AFTER_HOURS`
 * bloquee el ciclo programado — mismo criterio (y mismo evento de log)
 * que `resolveDeactivateStaleAfterHours` en `route.ts`, duplicado aquí a
 * propósito: este cambio añade ÚNICAMENTE este fichero, sin tocar
 * `route.ts` para extraer un helper compartido.
 */
function resolveDeactivateStaleAfterHoursForScheduler(): number | undefined {
  try {
    return readDeactivateStaleAfterHours(process.env);
  } catch (error) {
    if (error instanceof InvalidDeactivateStaleAfterHoursError) {
      console.warn({ event: "awin_sync_invalid_deactivate_stale_config", message: error.message });
      return undefined;
    }
    throw error;
  }
}

export type AwinSchedulerDeps = {
  /** Por defecto, `runAwinCatalogSyncCycle` real. Las pruebas inyectan un doble: cero red, cero proceso real. */
  runCycle?: (options: Parameters<typeof runAwinCatalogSyncCycle>[0]) => Promise<AwinOrchestratorSummary>;
};

/**
 * Ejecuta UN ciclo real de Awin (`dryRun: false`, igual que las
 * ejecuciones `schedule` del workflow de GitHub Actions) y registra
 * SIEMPRE un evento — nunca lanza, nunca deja una excepción sin capturar:
 * el `catch` cubre tanto un fallo real del ciclo como un bloqueo de ciclo
 * ya en curso (`AwinOrchestratorLockBusyError`), con el mismo criterio y
 * la misma forma de log que el callback de `after()` en `route.ts`.
 */
export async function runScheduledAwinSync(apiKey: string, feedListUrl: string | undefined, deps: AwinSchedulerDeps = {}): Promise<void> {
  const runCycle = deps.runCycle ?? runAwinCatalogSyncCycle;
  const startedAt = Date.now();
  const deactivateStaleAfterHours = resolveDeactivateStaleAfterHoursForScheduler();

  try {
    const summary = await runCycle({ apiKey, feedListUrl, dryRun: false, deactivateStaleAfterHours });
    console.log({
      event: "awin_sync_done",
      durationMs: Date.now() - startedAt,
      dryRun: summary.dryRun,
      deactivateStaleAfterHoursConfigured: deactivateStaleAfterHours !== undefined,
      ok: !summary.listFatalError && summary.feedsFailed === 0 && summary.advertisersIncomplete === 0,
      feedsDiscovered: summary.feedsDiscovered,
      feedsApproved: summary.feedsApproved,
      feedsSkippedNotJoined: summary.feedsSkippedNotJoined,
      feedsInvalidInList: summary.feedsInvalidInList,
      advertisersProcessed: summary.advertisersProcessed,
      advertisersSuccessful: summary.advertisersSuccessful,
      advertisersIncomplete: summary.advertisersIncomplete,
      validRowsTotal: summary.validRowsTotal,
      invalidRowsTotal: summary.invalidRowsTotal,
      feedsCompleted: summary.feedsCompleted,
      feedsFailed: summary.feedsFailed,
      feedsEmpty: summary.feedsEmpty,
      productsCreatedTotal: summary.productsCreatedTotal,
      productsUpdatedTotal: summary.productsUpdatedTotal,
      offersCreatedTotal: summary.offersCreatedTotal,
      offersUpdatedTotal: summary.offersUpdatedTotal,
      staleDeactivatedTotal: summary.staleDeactivatedTotal,
      // Solo identificadores ya públicos y un código fijo de motivo — nunca
      // la URL del feed, la API key ni un mensaje crudo (mismo criterio que route.ts).
      feedFailures: summarizeAwinFeedFailures(summary.feeds),
    });
  } catch (error) {
    console.error({
      event: error instanceof AwinOrchestratorLockBusyError ? "awin_sync_lock_busy" : "awin_sync_failed",
      durationMs: Date.now() - startedAt,
    });
  }
}

/**
 * Programa la SIGUIENTE ejecución (nunca ejecuta nada de inmediato) y,
 * cuando llegue, ejecuta el ciclo y se reprograma a sí misma en un
 * `finally` — pase lo que pase en esa ejecución, siempre queda una
 * próxima programada. `setTimeout` (nunca `setInterval`) es justo lo que
 * garantiza que nunca haya dos ejecuciones solapadas dentro de este
 * mismo proceso: la siguiente no se programa hasta que la anterior ha
 * terminado por completo.
 */
export function scheduleNextAwinSync(deps: AwinSchedulerDeps = {}): void {
  const ms = computeMsUntilNextRun(new Date(), DAILY_UTC_TIMES);
  const timer = setTimeout(() => {
    void (async () => {
      try {
        const apiKey = process.env.AWIN_DATAFEED_API_KEY?.trim();
        if (apiKey) {
          const feedListUrl = process.env.AWIN_DATAFEED_LIST_URL?.trim();
          await runScheduledAwinSync(apiKey, feedListUrl, deps);
        }
      } finally {
        scheduleNextAwinSync(deps);
      }
    })();
  }, ms);
  // Un temporizador pendiente nunca debe, por sí solo, impedir un apagado
  // normal del proceso — el propio servidor HTTP ya mantiene vivo el
  // proceso mientras está sirviendo peticiones, esto es solo higiene.
  timer.unref?.();
}

/**
 * Punto de entrada que llama Next.js exactamente una vez al arrancar el
 * proceso del servidor (`next start`), antes de servir ninguna petición.
 * Completa de forma síncrona e instantánea — solo programa un
 * temporizador, nunca espera a que termine ningún ciclo real, así que
 * nunca retrasa el arranque de la web.
 */
export function register(deps: AwinSchedulerDeps = {}): void {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const apiKey = process.env.AWIN_DATAFEED_API_KEY?.trim();
  if (!apiKey) return;
  scheduleNextAwinSync(deps);
}
