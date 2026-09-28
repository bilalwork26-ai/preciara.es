/**
 * Lectura y validación de `AWIN_DEACTIVATE_STALE_AFTER_HOURS`, compartida
 * entre los dos disparadores reales del ciclo de Awin —
 * `src/app/api/jobs/awin-sync/route.ts` (el que usa GitHub Actions) y
 * `scripts/sync-awin.ts` (ejecución manual por línea de comandos) — para
 * no duplicar esta lógica en dos sitios. `awinOrchestrator.ts` nunca lee
 * esta variable directamente (recibe `deactivateStaleAfterHours` siempre
 * como parámetro explícito, ver su propio comentario de cabecera); son
 * los disparadores quienes deben leerla y pasarla.
 *
 * `undefined` (variable ausente o vacía) es la opción más segura por
 * defecto: ningún anunciante desactiva nada ese ciclo, pase lo que pase
 * con el resto de condiciones (ver `evaluateDeactivationEligibility` en
 * `awinOrchestrator.ts`).
 */

/** Acotado con margen generoso (1 año) a propósito: nunca un valor absurdo por error de tecleo (p. ej. un cero de más), pero sin restringir ningún uso real razonable. */
export const MAX_DEACTIVATE_STALE_AFTER_HOURS = 24 * 365;

export class InvalidDeactivateStaleAfterHoursError extends Error {
  readonly code = "INVALID_DEACTIVATE_STALE_AFTER_HOURS";
}

/** `undefined` (ausente o vacía) es la opción más segura por defecto. Si se aporta, debe ser un número finito, positivo y acotado — cualquier otro valor lanza `InvalidDeactivateStaleAfterHoursError`, nunca se redondea ni se sustituye en silencio. */
export function readDeactivateStaleAfterHours(env: Record<string, string | undefined>): number | undefined {
  const raw = env.AWIN_DEACTIVATE_STALE_AFTER_HOURS;
  if (raw === undefined || raw.trim() === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_DEACTIVATE_STALE_AFTER_HOURS) {
    throw new InvalidDeactivateStaleAfterHoursError(
      `AWIN_DEACTIVATE_STALE_AFTER_HOURS debe ser un número finito, positivo y como mucho ${MAX_DEACTIVATE_STALE_AFTER_HOURS} (un año) — el valor recibido no es válido.`
    );
  }
  return value;
}
