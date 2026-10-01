/**
 * Defensa de ÚLTIMA línea contra títulos en portugués colándose en el
 * catálogo (exclusivamente en español): el filtro principal es por
 * idioma, a nivel de FEED (ver `isSpanishFeedLanguage` en
 * `awinOrchestrator.ts`, que ya evita descargar un feed no español). Esta
 * comprobación cubre el caso en que esa columna `Language` de la lista de
 * feeds venga ausente o mal rellenada mientras el propio TEXTO de la fila
 * sigue viniendo en portugués — caso real reportado: títulos como
 * "Ventoinha", "Humidificador de ar", "Comando à distância" en la
 * categoría Hogar (feed de Trotec).
 *
 * Palabras/frases deliberadamente ESPECÍFICAS del portugués, sin
 * equivalente ni coincidencia parcial en español — nunca una palabra
 * ambigua que pudiera rechazar un título español legítimo por error.
 */
const PORTUGUESE_MARKERS: readonly string[] = [
  "ventoinha",
  "humidificador de ar",
  "purificador de ar",
  "ar condicionado",
  "aspirador de po",
  "maquina de lavar roupa",
  "comando a distancia",
  "televisao",
  "roupa",
  "aparelho",
];

/** Misma normalización (sin diacríticos, minúsculas) que `categoryMapping.ts` — aplicada aquí solo para comparar. */
function normalize(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * `true` solo si el texto contiene alguna palabra/frase inequívocamente
 * portuguesa. Nunca lanza, nunca devuelve `true` para una cadena vacía.
 */
export function looksPortugueseText(text: string): boolean {
  if (!text) return false;
  const normalized = normalize(text);
  return PORTUGUESE_MARKERS.some((marker) => normalized.includes(marker));
}
