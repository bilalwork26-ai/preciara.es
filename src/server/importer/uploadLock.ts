/**
 * Mutex en memoria para el endpoint de subida del panel técnico: evita que
 * dos importaciones reales (no "Simular") se ejecuten a la vez desde el
 * navegador. Es un bloqueo de proceso, no distribuido — el panel se sirve
 * desde un único proceso Node, así que basta con esto. La automatización
 * por CLI/cron (`scripts/import-csv.ts`) usa su propio bloqueo distribuido
 * con `GET_LOCK` de MySQL, que sí protege entre procesos y máquinas
 * distintas cuando se conecte una tarea programada (Fase 3).
 */
let locked = false;

export function tryAcquireUploadLock(): boolean {
  if (locked) return false;
  locked = true;
  return true;
}

export function releaseUploadLock(): void {
  locked = false;
}
