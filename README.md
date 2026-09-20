# Preciara

Comparador de precios y afiliación para el mercado español. Este repositorio
contiene el sitio web (Next.js), construido para desplegarse en Hostinger
sobre Node.js.

**Estado actual: Fase 2A** — motor interno completo (base de datos MySQL +
Prisma, importador CSV, panel técnico privado) construido y probado, listo
para conectarse en producción. La portada pública sigue usando los datos de
demostración de `src/data/demo/*`, sin cambios visuales: la base de datos
todavía no está conectada a los componentes públicos (ver [Cómo pasar de
datos demo a datos reales](#cómo-pasar-de-datos-demo-a-datos-reales)).

## Stack técnico

- [Next.js 16](https://nextjs.org) (App Router) + React 19
- TypeScript en modo estricto
- Tailwind CSS v4
- [lucide-react](https://lucide.dev) para iconografía
- [Prisma 6](https://www.prisma.io) + MySQL (Fase 2A)
- [Vitest](https://vitest.dev) para pruebas

## Desarrollo local

Requiere Node.js 22 (igual que el entorno de Hostinger).

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). La web funciona sin
ninguna configuración adicional: sin `DATABASE_URL`, todo sigue funcionando
con datos de demostración.

Antes de subir cambios, comprueba que todo pasa:

```bash
npm run lint            # ESLint
npx tsc --noEmit         # comprobación de tipos
npm test                 # pruebas (vitest)
npm run db:validate      # valida prisma/schema.prisma (no necesita BD)
npm run build             # build de producción (tampoco necesita BD)
```

## Estructura del proyecto

```
prisma/
  schema.prisma     Esquema de datos (MySQL)
  migrations/        Historial de migraciones (se commitea)
  seed.ts            Seed idempotente con los datos de demostración
examples/
  ofertas-ejemplo.csv  CSV de ejemplo, totalmente ficticio
scripts/
  import-csv.ts      Runner de importación por línea de comandos (cron-ready)
src/
  app/
    (site)/          Grupo de rutas públicas: portada, /buscar, legales
                      (comparte layout con Header/Footer; las URLs no cambian)
    admin/            Panel técnico privado (/admin/**), layout propio
    api/admin/         Endpoints protegidos usados por el panel
    robots.ts          Bloquea /admin y /api/ para buscadores
    layout.tsx          Layout raíz: fuentes, metadatos, globals.css
  proxy.ts             Protege /admin y /api/admin (ver "Panel técnico")
  components/
    layout/            Cabecera y pie de página (solo en el grupo (site))
    home/               Secciones de la página principal
    ui/                 Componentes reutilizables (tarjetas, insignias, etc.)
    legal/               Plantilla de páginas legales
  server/
    db/client.ts         Cliente Prisma compartido + fallback sin BD
    repositories/         Consultas tipadas (categorías, productos, ofertas,
                          historial, estado del sistema, panel técnico)
    importer/              Parser CSV, validación, orquestación de la
                          importación, detección/desactivación de ofertas viejas
    admin/auth.ts           Autenticación del panel técnico (sin tabla de usuarios)
  data/demo/            Datos de demostración, centralizados y fáciles de sustituir
  lib/                   Utilidades (formato de precios, etc.)
  types/                  Tipos del dominio usados por los componentes actuales
  generated/prisma/       Cliente de Prisma generado (NO se commitea)
```

## Datos de demostración

Todo lo que se ve **en la portada pública** (precios, tiendas, historiales)
vive en `src/data/demo/` y está claramente marcado como ficticio en cada
fichero. No representa tiendas, precios ni ofertas reales.

Además, desde la Fase 2A, el seed (`npm run db:seed`) carga esos mismos
datos en la base de datos, marcados con `isDemo: true` en comercios,
productos y ofertas, para poder probar el circuito completo
(BD → repositorios → panel técnico) sin inventar nada. El panel técnico
distingue siempre entre datos demo y datos reales (insignia "Demo" en cada
tabla, contadores separados en el resumen).

## Variables de entorno

Copia `.env.example` a `.env.local` **y también** a `.env` (la CLI de
Prisma solo lee `.env`, Next.js lee ambos) y rellena los valores reales.
Nunca subas `.env` ni `.env.local` al repositorio: ya están ignorados en
`.gitignore`. Nunca escribas contraseñas reales en el propio
`.env.example`, en logs, en capturas ni en el seed.

| Variable | Obligatoria | Descripción |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | No (tiene valor por defecto) | URL pública, usada en metadatos SEO/Open Graph. |
| `DATABASE_URL` | No | Conexión MySQL. Sin ella, todo sigue funcionando con datos de demostración. |
| `ADMIN_PASSWORD` | Solo para abrir `/admin` | Contraseña del panel técnico. Sin ella (o sin `ADMIN_SESSION_SECRET`), `/admin` y `/api/admin` responden 404 siempre. |
| `ADMIN_SESSION_SECRET` | Solo para abrir `/admin` | Secreto para firmar la cookie de sesión del panel. Genera un valor propio con `openssl rand -hex 32`. |
| `OFFER_STALE_AFTER_HOURS` | No (por defecto 72) | Horas sin revisar una oferta antes de considerarla "vieja". |
| `SYNC_JOB_SECRET` | No (Fase 3, aún sin usar) | Reservada para un futuro endpoint de sincronización automática. |

## Base de datos (MySQL + Prisma)

Se usa **Prisma 6.19.3** (la última versión estable antes de la serie
`8.0.0-rc`, que en el momento de escribir esto es la etiqueta `latest` de
npm pero sigue en fase de release candidate — no apta para producción).
Prisma 6.19.3 soporta Node `>=18.18` (Node 22 incluido) y MySQL de forma
nativa. La familia `7.x` también existe y es estable, pero arrastra una
dependencia transitiva (`mysql2` + `deepmerge-ts`) con vulnerabilidades
conocidas (`npm audit`); `6.19.3` no la tiene. El `package.json` incluye un
`overrides` de `deepmerge-ts` como cinturón de seguridad adicional.

### Esquema

Modelos principales (ver `prisma/schema.prisma` para el detalle completo:
tipos, índices, restricciones):

- **Category** — categorías del catálogo (slug único).
- **Product** — productos (slug único, `isDemo`, relación a `Category`).
- **Merchant** — comercios (slug único, `isDemo`).
- **Offer** — oferta vigente de un producto en un comercio. Como mucho una
  oferta activa por combinación `(productId, merchantId)` (restricción
  `@@unique`), para que el importador nunca duplique la misma oferta del
  mismo comercio. Precios en `Decimal(10,2)`, nunca coma flotante.
- **PriceSnapshot** — historial de precios de una oferta. Solo se crea un
  registro nuevo cuando el precio o la disponibilidad cambian respecto al
  último (ver "Importador CSV").
- **ImportRun** / **ImportError** — registro de cada ejecución del
  importador (contadores, estado, resumen) y de cada fila rechazada
  (código, mensaje, copia segura de la fila).

### Migraciones

```bash
npm run db:validate        # valida el esquema (no necesita BD)
npm run db:migrate:dev      # desarrollo: crea y aplica una migración nueva
npm run db:migrate:deploy   # producción: aplica solo las migraciones pendientes
npm run db:migrate:status   # qué migraciones están aplicadas
```

`db:migrate:deploy` **nunca** borra datos ni genera migraciones nuevas: solo
aplica las que ya existen en `prisma/migrations/` (comportamiento estándar
de Prisma, seguro para producción). Las dos migraciones actuales
(`20260920121646_init` y `20260920121948_add_is_demo_flags`) se generaron y
se probaron contra un MySQL real (MariaDB 10.11 en local) antes de
commitearse.

**Antes de tocar una base de datos ya existente**, inspecciónala primero
(`npm run db:migrate:status` con el `DATABASE_URL` correspondiente) y
confirma que es la base de Preciara, no la de otra web en el mismo
hosting.

### Seed

```bash
npm run db:seed
```

Carga categorías, comercios, productos, ofertas e historial de precios
suficiente para el gráfico, usando exactamente los datos de
`src/data/demo/*`. Es **idempotente**: ejecutarlo varias veces no duplica
nada (usa `slug`/`(productId, merchantId)` como claves estables, y solo
inserta historial si la oferta todavía no tiene ninguno). Todo lo que crea
queda marcado `isDemo: true`.

### Capa de acceso a datos

Los componentes visuales nunca importan Prisma directamente. Toda consulta
pasa por `src/server/repositories/*.ts` (tipadas, sin problema N+1 — usan
`include`/`select` de Prisma para traer relaciones en una sola consulta) y
por el cliente compartido `src/server/db/client.ts`:

- Sin `DATABASE_URL`: `prisma` es `null`, ninguna función intenta conectar.
- Con `DATABASE_URL` pero la consulta falla: el error técnico se registra
  con `console.error` (visible en los logs del servidor) y la función
  devuelve `null`; nunca se convierte silenciosamente en "no hay datos"
  sin dejar rastro.
- Repositorios disponibles: categorías activas, productos con sus ofertas,
  búsqueda, ofertas recientes/viejas, historial de precios, estado general
  del sistema, ejecuciones y errores del importador (usados hoy por el
  panel técnico; listos para que la portada pública los adopte en un paso
  posterior, ver más abajo).

## Importador CSV

### Formato

CSV en UTF-8, cabecera obligatoria con estas columnas (ver
`examples/ofertas-ejemplo.csv` para un ejemplo completo y ficticio):

```
category_slug, category_name, product_slug, product_name, brand, model,
ean, image_url, merchant_slug, merchant_name, merchant_url,
external_offer_id, price, previous_price, currency, availability,
shipping_cost, product_url, affiliate_url, last_checked_at
```

Obligatorias por fila: `category_slug`, `product_slug`, `product_name`,
`merchant_slug`, `merchant_name`, `merchant_url`, `price`, `availability`,
`product_url`. Si `category_slug` o `merchant_slug` no existen todavía,
esa fila los crea (necesita `category_name`; `merchant_name` +
`merchant_url` ya son obligatorios siempre).

Reglas de validación (estrictas; una fila inválida se rechaza, el resto del
CSV se sigue procesando):

- **Precios**: acepta punto decimal (`19.99`) y normaliza coma española
  (`19,99` → `19.99`, `1.234,56` → `1234.56`, `1,234.56` → `1234.56`).
  Nunca negativos.
- **`availability`**: `in_stock`, `out_of_stock`, `preorder`,
  `discontinued`, `unknown` (o sinónimos en español: `disponible`,
  `agotado`, `reserva`/`preventa`, `descatalogado`, `desconocido`).
- **URLs** (`merchant_url`, `product_url`, `affiliate_url`, `image_url`):
  solo `http://`/`https://`. No se descarga ni se sigue ninguna URL en
  esta fase — solo se valida y se guarda.
- **`currency`**: código de 3 letras, `EUR` por defecto si se omite.
- Límites: máx. 5 MB y 5000 filas por fichero (`MAX_CSV_BYTES`,
  `MAX_CSV_ROWS` en `src/server/importer/run.ts`).
- El contenido nunca se confía por el nombre del fichero ni se interpreta
  como HTML: es texto plano parseado con un parser CSV propio (RFC 4180),
  sin dependencias externas.

Procesamiento: idempotente (actualiza por `slug`/`(productId, merchantId)`,
nunca duplica), y solo crea un `PriceSnapshot` nuevo cuando el precio o la
disponibilidad cambian respecto al último registro de esa oferta.

### Uso

**Desde el panel técnico** (`/admin/importar`): sube el CSV, pulsa
"Simular" para ver qué se crearía/actualizaría sin tocar la base de datos
(no escribe nada, no deja rastro en el historial), y "Importar de verdad"
cuando estés conforme.

**Desde la línea de comandos** (para automatizar más adelante):

```bash
npm run db:import -- ruta/al/fichero.csv [--dry-run] [--source=etiqueta]
npm run db:import -- --deactivate-stale [--stale-hours=72]
```

Usa un bloqueo distribuido con `GET_LOCK` de MySQL (impide dos
importaciones simultáneas, incluso desde máquinas distintas, y se libera
solo si el proceso muere), emite logs estructurados en JSON (una línea por
evento, con un `runId` propio) y usa códigos de salida:

- `0` = correcta o parcial (revisa `/admin/errores` si hubo rechazos)
- `1` = fallida (nada aprovechable, o error de configuración)
- `2` = no se pudo obtener el bloqueo (ya hay otra importación en curso)
- `3` = error de uso (argumentos, fichero no encontrado, falta `DATABASE_URL`)

Todavía **no** hay ningún cron ni GitHub Action conectado: esto es
preparación para la Fase 3. Tampoco hay scraping ni integraciones con
Amazon/Awin/etc. — solo el circuito CSV, listo para enchufar una fuente
oficial más adelante.

## Panel técnico (`/admin`)

- **Cerrado por defecto**: sin `ADMIN_PASSWORD` + `ADMIN_SESSION_SECRET`,
  `/admin/**` y `/api/admin/**` responden 404 siempre (nunca "abierto sin
  contraseña"). La protección vive en `src/proxy.ts` (sustituye a
  `middleware.ts`, renombrado en Next.js 16) y se repite dentro del
  endpoint de importación como defensa en profundidad.
- **Sesión**: una cookie `httpOnly` firmada con HMAC-SHA256 (secreto
  `ADMIN_SESSION_SECRET`), válida 12 horas. No hay tabla de usuarios ni
  contraseña por defecto.
- **No indexable**: `robots.txt` bloquea `/admin` y `/api/`, y además cada
  respuesta de esas rutas lleva la cabecera `X-Robots-Tag: noindex,
  nofollow`.
- **Contenido**: resumen (productos/comercios/ofertas activos, última
  importación, cambios de precio recientes, ofertas sin revisar, estado de
  la BD y si la portada usa BD o el fallback demo), y listados de
  productos, comercios, ofertas, historial de importaciones (con detalle
  por ejecución) y errores.

Acceso: entra en `/admin`, introduce la contraseña de `ADMIN_PASSWORD`.
"Cerrar sesión" en la cabecera borra la cookie.

## Pruebas

```bash
npm test
```

Cubre (todo en `src/server/**/*.test.ts` y `src/proxy.test.ts`):

- Parser CSV (comillas, comas dentro de campos, comillas escapadas,
  saltos de línea, CRLF, BOM).
- Validación de campos (decimales con coma española, precios negativos,
  slugs, URLs, disponibilidad, moneda, fechas).
- Autenticación del panel (contraseña, token de sesión firmado, caducidad,
  manipulación de la firma).
- Protección de rutas (`proxy.ts`): 404 sin configurar, redirección a
  login, 401 en la API, acceso con sesión válida.
- Fallback sin `DATABASE_URL` (el cliente Prisma no se construye, ninguna
  consulta intenta conectar).
- Conversión de registros de Prisma (`Decimal`) a números planos en los
  repositorios.

Las pruebas de integración que necesitan una base de datos real (import
idempotente, creación/actualización de ofertas y su historial, filas
inválidas sin cancelar el resto) están en `src/server/importer/run.test.ts`
y `src/server/repositories/repositories.test.ts`: se **omiten
automáticamente** (`describe.skipIf`) si no hay `DATABASE_URL` — por
ejemplo en un checkout limpio sin MySQL local. Para ejecutarlas de verdad,
apunta `DATABASE_URL` a una base MySQL/MariaDB local de pruebas (nunca a
la de producción) antes de `npm test`.

## Verificaciones antes de publicar

```bash
npm run lint
npx tsc --noEmit
npm test
npm run db:validate
npm run db:generate
npm run build
```

Ninguno de estos pasos requiere `DATABASE_URL`: el build genera el cliente
de Prisma a partir del esquema (no se conecta a ninguna base), y las
páginas de `/admin` se sirven siempre en modo dinámico (usan `cookies()`
para la sesión), así que tampoco intentan consultar la base durante el
build.

## Preparación para tareas programadas

`scripts/import-csv.ts` está pensado para invocarse desde un cron o una
GitHub Action en una fase posterior (Fase 3), sin cambios: acepta un
fichero local, usa bloqueo distribuido para evitar solapes, y
`--deactivate-stale` puede ejecutarse aparte para desactivar (nunca
borrar) ofertas más viejas que `OFFER_STALE_AFTER_HOURS`. Esta fase
**no** activa ningún cron ni scraping real — solo deja el comando listo.

## Despliegue en Hostinger

1. Hostinger despliega automáticamente al recibir cambios en `main` (ya
   configurado; no se ha tocado `mcp.hostinger.com`).
2. El build (`npm install && npm run build`) funciona sin `DATABASE_URL`:
   la web pública sigue sirviendo datos de demostración hasta que actives
   la base de datos.
3. Para activar la base de datos en Hostinger:
   - Crea la base MySQL desde el panel de Hostinger.
   - Define `DATABASE_URL` en las variables de entorno del sitio (panel
     Hostinger → tu sitio → Variables de entorno; no la subas nunca al
     repositorio).
   - Ejecuta `npm run db:migrate:deploy` (aplica las migraciones ya
     commiteadas, no genera ninguna nueva) y, si quieres cargar los datos
     de demostración para verificar el circuito, `npm run db:seed`.
4. Para activar el panel técnico, define además `ADMIN_PASSWORD` y
   `ADMIN_SESSION_SECRET` (valores propios, largos y aleatorios — nunca
   los de este README) en las mismas variables de entorno del sitio.
5. Si falta `DATABASE_URL` en producción: la web pública sigue con el
   fallback de demostración y `/admin` permanece cerrado (404). No es un
   estado de error: es el comportamiento por defecto seguro.

### Cómo pasar de datos demo a datos reales

1. Confirma que `DATABASE_URL` apunta a la base de datos correcta de
   Hostinger (nunca a la de otro sitio).
2. `npm run db:migrate:deploy` para asegurarte de que el esquema está al
   día.
3. Prepara un CSV real con el formato documentado arriba (nunca inventes
   comercios, precios ni disponibilidad: solo datos que tengas autorizados
   para publicar) y súbelo desde `/admin/importar`, primero en modo
   "Simular" y luego de verdad.
4. Revisa `/admin/ofertas` y `/admin/errores` para confirmar que todo se
   importó como esperabas.
5. La portada pública **todavía no lee** de la base de datos en esta fase
   (sigue mostrando `src/data/demo/*`, deliberadamente, para no tocar el
   diseño aprobado sin permiso explícito). El siguiente paso natural —
   fuera del alcance de esta fase — es adaptar los componentes de la
   portada para recibir los datos ya transformados por
   `src/server/repositories/*` en lugar de importar `src/data/demo/*`
   directamente; los repositorios y el fallback ya están listos para eso.

### Cómo volver atrás si el despliegue falla

- Un fallo de build o de arranque en Hostinger no requiere revertir la
  base de datos: el build no depende de ella, así que basta con revertir
  el commit problemático en GitHub (`git revert`) y dejar que Hostinger
  vuelva a desplegar.
- Si una migración (`db:migrate:deploy`) diera problemas, Prisma no
  ejecuta nada destructivo por sí solo: revisa `npm run db:migrate:status`
  para ver qué quedó aplicado antes de intentar nada más, y no ejecutes
  `prisma migrate reset` (borra todos los datos) contra una base con
  datos reales.
- Si el panel técnico da problemas, basta con quitar `ADMIN_PASSWORD` /
  `ADMIN_SESSION_SECRET` de las variables de entorno para cerrarlo
  inmediatamente (404) sin afectar a la web pública.

## Hoja de ruta

- **Fase 1**: estructura, sistema visual, página principal y páginas
  legales con datos de demostración. *(hecho)*
- **Fase 2A** (este repositorio): esquema de base de datos (MySQL +
  Prisma), migraciones, seed idempotente, capa de acceso a datos,
  importador CSV con panel técnico privado, preparación para
  automatización. *(hecho — ver estado arriba)*
- **Fase 2B** (siguiente paso natural, no iniciado): adaptar la portada
  pública para leer de la base de datos a través de
  `src/server/repositories/*` cuando haya datos reales, manteniendo el
  fallback de demostración.
- **Fase 3**: integración con una fuente de datos real y autorizada,
  automatización programada (cron/GitHub Actions) sobre
  `scripts/import-csv.ts`.
- **Fase 4**: más tiendas, alertas de precio, usuarios, blog.
