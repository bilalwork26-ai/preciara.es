#!/usr/bin/env -S npx tsx
/**
 * Ejecutor de producción para UNA sincronización completa de Awin
 * (`npm run catalog:sync:awin`) — pensado para un cron job personalizado
 * de Hostinger: proceso de línea de comandos, nunca un endpoint HTTP ni
 * una tarea que dependa de que alguien pulse un botón. Invoca EXACTAMENTE
 * una vez a `runAwinCatalogSyncCycle` (`awinOrchestrator.ts`) y espera a
 * que termine por completo antes de salir — nunca implementa su propia
 * lógica de descubrimiento, streaming, agrupación ni bloqueo (todo eso ya
 * vive en `awinOrchestrator.ts`/`syncRun.ts`; este fichero es solo el
 * envoltorio de proceso, siguiendo el mismo patrón que
 * `scripts/import-csv.ts` y `scripts/build-migrate.ts`: una función
 * exportada, comprobable sin proceso real ni red — ver
 * `sync-awin.test.ts` —, y una invocación al final del fichero).
 *
 * Uso:
 *   npm run catalog:sync:awin
 *   npm run catalog:sync:awin -- --dry-run
 *
 * Variables de entorno:
 *   AWIN_DATAFEED_API_KEY (obligatoria): API key de Awin. Ausente, vacía o
 *     compuesta solo por espacios detiene la ejecución ANTES de tocar
 *     Awin o crear ningún `ImportRun` (código de salida 3) — su valor
 *     nunca se registra, se devuelve ni se incluye en ningún error.
 *   AWIN_DEACTIVATE_STALE_AFTER_HOURS (opcional): horas sin refrescar una
 *     oferta antes de poder desactivarla en la pasada final de cada
 *     anunciante (ver la regla conservadora de `awinOrchestrator.ts`). Si
 *     se omite, NINGÚN anunciante desactiva nada este ciclo — opción más
 *     segura por defecto. Si se indica, debe ser un número finito,
 *     positivo y como mucho un año (8760 horas); cualquier otro valor
 *     (cero, negativo, `NaN`, infinito, texto, o excesivo) detiene la
 *     ejecución antes de iniciar el ciclo (código de salida 3).
 *
 * Códigos de salida:
 *   0 = ciclo completado sin fallos (ningún feed falló, ningún anunciante
 *       quedó incompleto, la lista de feeds no tuvo un error fatal).
 *   1 = el ciclo llegó a ejecutarse pero con algún fallo (feed(s)
 *       fallidos, anunciante(s) incompletos, o error fatal de la lista) —
 *       o un error inesperado no modelado durante la ejecución.
 *   2 = ya había otro ciclo completo de Awin en curso (bloqueo EXTERIOR
 *       ocupado, `AWIN_CYCLE_LOCK_NAME` — ver `awinOrchestrator.ts`, el
 *       mismo bloqueo que ya adquiere/libera `runAwinCatalogSyncCycle`:
 *       este script nunca construye un segundo sistema de bloqueo).
 *       Termina sin haber iniciado un segundo ciclo, sin corromper nada.
 *   3 = error de configuración (falta `DATABASE_URL`, falta o es
 *       inválida `AWIN_DATAFEED_API_KEY`, o `AWIN_DEACTIVATE_STALE_AFTER_HOURS`
 *       no es un número válido) — nunca llega a tocar Awin ni la base de
 *       datos de ofertas.
 *
 * `--dry-run` se reconoce ÚNICAMENTE como flag simple, sin valor: usa
 * exactamente la misma lógica real de descubrimiento/streaming/validación
 * (nunca una segunda implementación propia), respetando tal cual la
 * semántica `dryRun` ya existente en `runCatalogSync`/
 * `runAwinCatalogSyncCycle` (nunca escribe nada en modo `dryRun`). Un
 * `--dry-run=algo` CON valor se rechaza explícitamente como error de
 * configuración — nunca se interpreta de forma ambigua, para que un cron
 * mal configurado no pueda activar `dryRun` por accidente.
 *
 * Señales: este proceso NO instala manejadores de `SIGINT`/`SIGTERM`
 * propios, a propósito — ni `runAwinCatalogSyncCycle` ni el transporte
 * (`awinTransport.ts`) aceptan hoy un `AbortSignal` externo para cancelar
 * limpiamente una descarga o una escritura a mitad, así que prometer una
 * cancelación "elegante" ante una señal sería falso. El comportamiento
 * por defecto de Node (terminar el proceso) es el correcto aquí. Una
 * finalización NORMAL (sin señal) siempre libera Prisma en un `finally` y
 * nunca deja el proceso colgado (ver el bloque final del fichero) — no
 * se llama a `process.exit()` en ningún punto, para no truncar la
 * escritura de los últimos eventos de log.
 *
 * SEGURIDAD: nunca se registra la API key, ninguna `SensitiveFeedUrl` ni
 * su valor revelado, ninguna fila de producto, ningún cuerpo de respuesta
 * ni el mensaje/`.stack`/`.cause` crudo de ningún error externo — todos
 * los eventos son objetos JSON de una sola línea con campos fijos y
 * seguros (duración, `dryRun`, contadores agregados, estado), la misma
 * disciplina que `syncRun.ts`/`awinOrchestrator.ts`. Esto hace que la
 * salida también sea legible/útil en "View Output" del cron de Hostinger.
 */
import { randomUUID } from "node:crypto";
import { prisma, isDatabaseConfigured } from "../src/server/db/client";
import { runAwinCatalogSyncCycle, AwinOrchestratorLockBusyError, type AwinOrchestratorSummary } from "../src/server/catalogSync/awinOrchestrator";

type LogEvent = Record<string, unknown> & { level: "info" | "warn" | "error"; event: string };

function log(entry: LogEvent): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...entry }));
}

/** Fallo de configuración detectado ANTES de tocar Awin o la base de datos — nunca incluye el valor bruto de ninguna variable en su mensaje. */
export class AwinSyncConfigError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

/** Acotado con margen generoso (1 año) a propósito: nunca un valor absurdo por error de tecleo (p. ej. un cero de más), pero sin restringir ningún uso real razonable. */
export const MAX_DEACTIVATE_STALE_AFTER_HOURS = 24 * 365;

/**
 * `--dry-run` se reconoce ÚNICAMENTE como flag simple — nunca con un
 * valor tras `=`, que se rechaza explícitamente en vez de interpretarse
 * de cualquier forma (evita que un cron mal configurado lo active sin
 * querer con un valor ambiguo).
 */
export function parseDryRunFlag(argv: string[]): boolean {
  let dryRun = false;
  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg.startsWith("--dry-run=")) {
      throw new AwinSyncConfigError(
        "AMBIGUOUS_DRY_RUN_FLAG",
        `"--dry-run" no admite un valor explícito (recibido "${arg}"): pásalo como flag simple ("--dry-run"), sin "=".`
      );
    }
  }
  return dryRun;
}

/** Nunca devuelve un valor vacío/solo-espacios: lanza `AwinSyncConfigError` en su lugar. El valor real nunca aparece en el mensaje de error. */
export function readAwinApiKey(env: Record<string, string | undefined>): string {
  const trimmed = env.AWIN_DATAFEED_API_KEY?.trim();
  if (!trimmed) {
    throw new AwinSyncConfigError(
      "MISSING_API_KEY",
      "Falta AWIN_DATAFEED_API_KEY (o está vacía / son solo espacios): no se inicia ninguna sincronización real de Awin sin ella."
    );
  }
  return trimmed;
}

/** `undefined` (ausente o vacía) es la opción más segura por defecto: ningún anunciante desactiva nada. Si se aporta, debe ser un número finito, positivo y acotado — cualquier otro valor lanza `AwinSyncConfigError`, nunca se redondea ni se sustituye en silencio. */
export function readDeactivateStaleAfterHours(env: Record<string, string | undefined>): number | undefined {
  const raw = env.AWIN_DEACTIVATE_STALE_AFTER_HOURS;
  if (raw === undefined || raw.trim() === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_DEACTIVATE_STALE_AFTER_HOURS) {
    throw new AwinSyncConfigError(
      "INVALID_DEACTIVATE_STALE_AFTER_HOURS",
      `AWIN_DEACTIVATE_STALE_AFTER_HOURS debe ser un número finito, positivo y como mucho ${MAX_DEACTIVATE_STALE_AFTER_HOURS} (un año) — el valor recibido no es válido.`
    );
  }
  return value;
}

export type AwinSyncCliDeps = {
  /** Por defecto, `runAwinCatalogSyncCycle` real (`awinOrchestrator.ts`) — que a su vez ya reutiliza su propio bloqueo exterior por defecto. Las pruebas sustituyen esto por un doble simulado: cero red, cero proceso real. */
  runCycle?: (options: Parameters<typeof runAwinCatalogSyncCycle>[0]) => Promise<AwinOrchestratorSummary>;
  /** Por defecto, `() => new Date()`. */
  now?: () => Date;
  /** Por defecto, desconecta el cliente Prisma real (si está configurado). Las pruebas inyectan un doble para comprobar que se llama EXACTAMENTE una vez, tanto en éxito como en fallo, sin tocar ninguna conexión real. */
  disconnect?: () => Promise<void>;
};

export type AwinSyncCliOutcome = { exitCode: number };

/**
 * Núcleo comprobable de la ejecución: recibe `argv`/`env` explícitos (en
 * vez de leer `process.argv`/`process.env` directamente) para que las
 * pruebas la llamen sin depender de un proceso real ni de variables de
 * entorno globales. Nunca lanza — cualquier fallo (de configuración, del
 * ciclo, o del bloqueo) se traduce siempre a un `exitCode` y a un evento
 * de log seguro antes de devolver el control. Desconecta Prisma en un
 * `finally` que envuelve TODA la función — tanto en éxito como en
 * cualquier fallo, incluidos los de configuración detectados antes de
 * tocar Awin (desconectar un cliente que ni siquiera llegó a conectar es
 * una operación segura y sin efecto).
 */
export async function runAwinSyncCommand(argv: string[], env: Record<string, string | undefined>, deps: AwinSyncCliDeps = {}): Promise<AwinSyncCliOutcome> {
  const runCycle = deps.runCycle ?? runAwinCatalogSyncCycle;
  const now = deps.now ?? (() => new Date());
  const disconnect =
    deps.disconnect ??
    (async () => {
      if (prisma) await prisma.$disconnect();
    });
  const runId = randomUUID();
  const startedAt = now();

  try {
    let dryRun: boolean;
    let apiKey: string;
    let deactivateStaleAfterHours: number | undefined;
    try {
      if (!isDatabaseConfigured()) {
        throw new AwinSyncConfigError("MISSING_DATABASE_URL", "Falta DATABASE_URL: no se puede iniciar una sincronización.");
      }
      dryRun = parseDryRunFlag(argv);
      apiKey = readAwinApiKey(env);
      deactivateStaleAfterHours = readDeactivateStaleAfterHours(env);
    } catch (error) {
      if (error instanceof AwinSyncConfigError) {
        log({ level: "error", event: "awin_sync_config_error", runId, code: error.code, message: error.message });
        return { exitCode: 3 };
      }
      throw error; // no debería ocurrir: solo AwinSyncConfigError se lanza en este bloque.
    }

    log({ level: "info", event: "awin_sync_start", runId, dryRun, deactivateStaleAfterHoursConfigured: deactivateStaleAfterHours !== undefined });

    try {
      const summary = await runCycle({ apiKey, dryRun, deactivateStaleAfterHours });
      const durationMs = now().getTime() - startedAt.getTime();
      const ok = !summary.listFatalError && summary.feedsFailed === 0 && summary.advertisersIncomplete === 0;

      log({
        level: ok ? "info" : "warn",
        event: "awin_sync_done",
        runId,
        durationMs,
        dryRun: summary.dryRun,
        ok,
        listFatalError: summary.listFatalError,
        feedsDiscovered: summary.feedsDiscovered,
        feedsApproved: summary.feedsApproved,
        feedsSkippedNotJoined: summary.feedsSkippedNotJoined,
        feedsInvalidInList: summary.feedsInvalidInList,
        feedsDuplicate: summary.feedsDuplicate,
        advertisersProcessed: summary.advertisersProcessed,
        advertisersSuccessful: summary.advertisersSuccessful,
        advertisersIncomplete: summary.advertisersIncomplete,
        validRowsTotal: summary.validRowsTotal,
        invalidRowsTotal: summary.invalidRowsTotal,
        feedsCompleted: summary.feedsCompleted,
        feedsFailed: summary.feedsFailed,
        feedsEmpty: summary.feedsEmpty,
      });

      return { exitCode: ok ? 0 : 1 };
    } catch (error) {
      const durationMs = now().getTime() - startedAt.getTime();
      if (error instanceof AwinOrchestratorLockBusyError) {
        log({ level: "warn", event: "awin_sync_lock_busy", runId, durationMs });
        return { exitCode: 2 };
      }
      // SEGURIDAD: el error crudo NUNCA se registra (podría contener datos
      // de un adaptador todavía no auditado) — solo un código fijo y
      // seguro, la misma disciplina que `syncRun.ts`/`awinOrchestrator.ts`.
      log({ level: "error", event: "awin_sync_failed", runId, durationMs, code: "UNEXPECTED_ERROR" });
      return { exitCode: 1 };
    }
  } finally {
    await disconnect();
  }
}

// Envoltorio de proceso: SOLO se ejecuta cuando este fichero es el punto de
// entrada real (invocado directamente, p. ej. por el cron de Hostinger o
// `npm run catalog:sync:awin`) — nunca cuando `sync-awin.test.ts` importa
// `runAwinSyncCommand` para probarla, que es justo lo que evita que las
// pruebas disparen sin querer un ciclo real (comprobado explícitamente:
// una importación nunca coincide con `process.argv[1]`).
const isDirectlyExecuted = import.meta.url === `file://${process.argv[1]}`;
if (isDirectlyExecuted) {
  // Nota: `runAwinSyncCommand` ya desconecta Prisma internamente (en su
  // propio `finally`, ver más arriba) tanto en éxito como en cualquier
  // fallo — este envoltorio no necesita (ni debe) repetirlo.
  runAwinSyncCommand(process.argv.slice(2), process.env)
    .then(({ exitCode }) => {
      process.exitCode = exitCode;
    })
    .catch(() => {
      // No debería ocurrir nunca (runAwinSyncCommand ya captura todo lo
      // esperado) — si ocurre de todos modos, es un bug no previsto: se
      // registra sin reutilizar ningún mensaje crudo.
      console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", event: "awin_sync_fatal" }));
      process.exitCode = 1;
    });
}
