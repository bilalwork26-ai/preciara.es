#!/usr/bin/env -S npx tsx
/**
 * Último paso de `npm run build`: crea o actualiza `tmp/restart.txt`.
 *
 * Muchos paneles de Node.js de Hostinger ejecutan la app bajo Phusion
 * Passenger (confirmado indirectamente: las cabeceras de la portada real
 * en producción traen `panel: hpanel` y `server: hcdn`, la firma de su
 * hosting gestionado). Passenger no recarga el código en cada despliegue
 * por sí solo — mantiene los procesos ya arrancados vivos y solo
 * comprueba si debe reciclarlos cuando cambia la fecha de modificación de
 * `tmp/restart.txt` (mecanismo oficial de Passenger, el mismo que usan
 * las apps Ruby/Python del mismo panel). Sin tocar ese fichero, un build
 * nuevo puede terminar sin ningún error y aun así el proceso en marcha
 * seguir sirviendo el código viejo indefinidamente — el síntoma real
 * visto en producción tras las PR #48/#49/#50 (build y "reinicio" sin
 * errores en el panel, pero la portada seguía con el comportamiento
 * anterior).
 *
 * Inofensivo si el hosting NO usa Passenger: solo crea/actualiza un
 * fichero vacío dentro de `tmp/`, sin ningún efecto para nadie más.
 */
import { mkdirSync, closeSync, openSync, utimesSync } from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "tmp");
const file = path.join(dir, "restart.txt");

mkdirSync(dir, { recursive: true });
const now = new Date();
try {
  utimesSync(file, now, now);
} catch {
  // El fichero todavía no existe en este checkout: se crea vacío.
  closeSync(openSync(file, "w"));
}

console.log("[build] tmp/restart.txt actualizado (señal de reinicio para Phusion Passenger, si el hosting lo usa).");
