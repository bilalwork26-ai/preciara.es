/**
 * Limitador de intentos de `/admin/login` en memoria (mismo patrón que
 * `importer/uploadLock.ts`: un único proceso Node, sin dependencias
 * nuevas ni tabla en la base de datos). No sustituye a un WAF, pero frena
 * los intentos automatizados de fuerza bruta: tras varios fallos seguidos
 * desde la misma IP, bloquea intentos nuevos durante un tiempo — nunca
 * revela si la contraseña estuvo cerca de ser correcta ni cuánta gente ha
 * fallado.
 */
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000; // ventana en la que cuentan los fallos
const LOCKOUT_MS = 10 * 60 * 1000; // tiempo bloqueado tras agotar los intentos
const MAX_TRACKED_KEYS = 2000; // cota de memoria: evita crecimiento sin límite

type Entry = { failures: number; windowStart: number; lockedUntil: number };
const attempts = new Map<string, Entry>();

function evictIfFull(): void {
  if (attempts.size < MAX_TRACKED_KEYS) return;
  const oldestKey = attempts.keys().next().value;
  if (oldestKey !== undefined) attempts.delete(oldestKey);
}

export function isLoginLocked(key: string): boolean {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (entry.lockedUntil > Date.now()) return true;
  if (entry.lockedUntil !== 0) attempts.delete(key); // bloqueo ya caducado: limpia
  return false;
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    evictIfFull();
    attempts.set(key, { failures: 1, windowStart: now, lockedUntil: 0 });
    return;
  }
  entry.failures += 1;
  if (entry.failures >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_MS;
  }
}

export function clearLoginFailures(key: string): void {
  attempts.delete(key);
}
