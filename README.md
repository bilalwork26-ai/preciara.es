# Preciara

Comparador de precios y afiliación para el mercado español. Este repositorio
contiene el sitio web (Next.js), construido para desplegarse en Hostinger
sobre Node.js.

**Estado actual: Fase 2B** — motor interno completo (base de datos MySQL +
Prisma, importador CSV, panel técnico privado) construido y probado, y la
portada pública y el buscador ya leen de esa base de datos a través de
`src/server/dataSource/*`, sin cambios visuales respecto al diseño
aprobado. Sin `DATABASE_URL`, con la base vacía, o si la conexión falla, la
web sigue funcionando automáticamente con los datos de demostración de
`src/data/demo/*` (ver [Cómo funciona el respaldo a datos de
demostración](#cómo-funciona-el-respaldo-a-datos-de-demostración)).

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
  build-migrate.ts    Paso automático del build: migra la BD si hay DATABASE_URL
  db-check.ts          CLI de `npm run db:check`
  db-prepare.ts         CLI de `npm run db:prepare`
  lib/dbConnection.ts    Comprobación de conexión compartida (build-migrate/db-check)
  lib/sanitizeError.ts    Oculta credenciales de cualquier mensaje de error
src/
  app/
    (site)/          Grupo de rutas públicas: portada, /buscar, legales
                      (comparte layout con Header/Footer; las URLs no cambian)
    admin/            Panel técnico privado (/admin/**), layout propio
    api/admin/         Endpoints protegidos usados por el panel
                      (import/ para subir CSV, import/template/ para la plantilla)
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
                          importación, detección/desactivación de ofertas viejas,
                          bloqueo contra ejecuciones simultáneas
    dataSource/             Capa que decide BD vs. demostración para la portada
                          pública y el buscador, y adapta los datos de Prisma
                          a los tipos que ya esperan los componentes
    admin/auth.ts           Autenticación del panel técnico (sin tabla de usuarios)
    admin/rateLimit.ts       Límite de intentos fallidos en /admin/login
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
de Prisma, seguro para producción). Todas las migraciones actuales
(`20260920121646_init`, `20260920121948_add_is_demo_flags`,
`20260920214103_mark_example_csv_as_demo`) se generaron y se probaron
contra un MySQL real (MariaDB 10.11 en local) antes de commitearse.

`20260920214103_mark_example_csv_as_demo` es una migración de **datos**,
no de esquema: corrige productos/comercios/ofertas que se hubieran
importado desde `examples/ofertas-ejemplo.csv` antes de que el importador
exigiera `is_demo` (ver "Importador CSV"), marcándolos `isDemo = true`.
Identifica esas filas solo por varias señales inequívocas del propio
fichero de ejemplo a la vez (slugs conocidos + `MarcaFicticia` +
dominios `.example.invalid`), nunca toca nada más, y es idempotente —
segura de aplicar en cualquier entorno, incluso uno que nunca importó ese
fichero.

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
  del sistema, ejecuciones y errores del importador. Los usa tanto el panel
  técnico como la portada pública (a través de `src/server/dataSource/*`,
  ver abajo).

### Cómo funciona el respaldo a datos de demostración

`src/server/dataSource/*` es la única puerta por la que la portada pública
y `/buscar` leen datos — ningún componente decide por su cuenta si usar BD
o demostración. Cada función pasa por `resolveWithFallback()`
(`withFallback.ts`), que centraliza la decisión:

1. Sin `DATABASE_URL`, con conexión caída, o si la consulta lanza un error:
   usa `src/data/demo/*` directamente. El error técnico real se registra
   con `console.error` en el servidor; el visitante nunca ve un mensaje
   técnico, una página en blanco ni un 500.
2. **Los registros marcados `isDemo: true` no cuentan como catálogo real,
   nunca.** Todas las consultas públicas (`src/server/repositories/products.ts`)
   excluyen explícitamente productos, comercios y ofertas con `isDemo:
   true` — vengan del seed de demostración (`npm run db:seed`) o de un CSV
   marcado como demo (`is_demo=true`, ver "Importador CSV"). Una base con
   solo catálogo demo se trata exactamente igual que una base vacía: cae
   al fallback aprobado. Esto es intencionado y es la protección directa
   contra volver a mostrar por error un CSV de ejemplo como si fuera
   catálogo real (ver la sección de Hostinger para el caso concreto que
   motivó esta regla).
3. Con base de datos disponible pero sin catálogo **real** suficiente
   (p. ej. recién migrada, sin importar nada todavía, o con solo
   `isDemo: true`): también usa demostración. Una *búsqueda* o *categoría*
   que no encuentra resultados en una base con catálogo real ya existente
   no cuenta como "insuficiente" — ese resultado vacío es real y se
   muestra tal cual, no se sustituye por demostración; pero si no hay
   ningún catálogo real en absoluto, el buscador también cae al fallback
   en vez de devolver una búsqueda "real" vacía.
4. Con catálogo real suficiente: usa la base de datos. Los datos de Prisma
   se adaptan con `src/server/dataSource/transform.ts` (nunca conversiones
   sueltas repartidas por los componentes) antes de llegar a la UI:
   `affiliateUrl` tiene prioridad sobre `productUrl`, los enlaces externos
   llevan `rel="nofollow sponsored noopener noreferrer"` y se abren en
   pestaña nueva, y nunca se marca una oferta real como "verificada" ni se
   inventan valoraciones, tiendas o descuentos.

La portada (`src/app/(site)/page.tsx`) usa
`export const dynamic = "force-dynamic"` a propósito: Next.js no detecta
las llamadas a Prisma como una señal para renderizar en cada petición (a
diferencia de `cookies()`/`headers()`), así que sin esta línea la página se
generaría una sola vez en el build y quedaría congelada con esos datos para
siempre. El build en sí **nunca** necesita `DATABASE_URL` — genera el
cliente de Prisma a partir del esquema, no se conecta a ninguna base.

Nunca se abre una conexión nueva por componente: `getFeaturedBundle()` y
`getDealsGridBundle()` agrupan cada sección de la portada en un número
pequeño y fijo de consultas (con `include`/`select` para traer relaciones
sin problema N+1), y `src/app/(site)/page.tsx` las lanza en paralelo con
`Promise.all`.

## Importador CSV

### Formato

CSV en UTF-8, cabecera obligatoria con estas columnas (ver
`examples/ofertas-ejemplo.csv` para un ejemplo completo y ficticio):

```
category_slug, category_name, product_slug, product_name, brand, model,
ean, image_url, merchant_slug, merchant_name, merchant_url,
external_offer_id, price, previous_price, currency, availability,
shipping_cost, product_url, affiliate_url, last_checked_at, is_demo
```

Obligatorias por fila: `category_slug`, `product_slug`, `product_name`,
`merchant_slug`, `merchant_name`, `merchant_url`, `price`, `availability`,
`product_url`. Si `category_slug` o `merchant_slug` no existen todavía,
esa fila los crea (necesita `category_name`; `merchant_name` +
`merchant_url` ya son obligatorios siempre).

**`is_demo`** (columna opcional, pero con un valor por defecto que hay que
conocer): `true`/`false` (o sinónimos: `1`/`0`, `yes`/`no`, `si`/`sí`/`no`).
Si la columna falta por completo, o si la celda está vacía, el valor por
defecto es **`true` (demo)** — el importador nunca asume que una fila es
real solo porque falte este dato. **Un fichero de datos reales debe
marcar `is_demo=false` explícitamente en cada fila.** Un valor que no sea
ninguno de los reconocidos se rechaza (`INVALID_IS_DEMO`) en vez de
adivinar. El producto, el comercio y la oferta creados por esa fila quedan
marcados con el mismo `isDemo` (ver "Cómo funciona el respaldo a datos de
demostración" para qué hace la portada pública con eso). Al **actualizar**
un registro que ya existía, una fila demo nunca puede degradar a real→demo
un producto/comercio/oferta ya marcado como real (protección contra
mezclar datos reales con datos de ejemplo por una resubida accidental);
una fila real sí puede confirmar como real algo que hasta ahora solo se
conocía por datos de demostración.

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

**Desde el panel técnico** (`/admin/importar`): descarga la plantilla CSV
(solo cabecera) si no tienes un fichero todavía, súbelo, pulsa "Simular"
para ver qué se crearía/actualizaría sin tocar la base de datos (no escribe
nada, no deja rastro en el historial), y "Importar de verdad" cuando estés
conforme. El resultado incluye un resumen en una frase pensado para
alguien sin conocimientos técnicos, además de los contadores detallados.
Dos importaciones reales a la vez desde el panel se rechazan con un aviso
claro (bloqueo en memoria del propio proceso: basta para un panel de un
único administrador).

**Desde la línea de comandos** (para automatizar más adelante):

```bash
npm run db:import -- ruta/al/fichero.csv [--dry-run] [--source=etiqueta]
npm run db:import -- --deactivate-stale [--stale-hours=72]
```

Usa un bloqueo distribuido por lease con caducidad (impide dos
importaciones simultáneas, incluso desde máquinas distintas, y se libera
solo o expira si el proceso muere — ver
`src/server/importer/distributedLock.ts`), emite logs estructurados en
JSON (una línea por evento, con un `runId` propio) y usa códigos de
salida:

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
  `ADMIN_SESSION_SECRET`), válida 12 horas, `secure` en producción y
  `sameSite: "lax"`. No hay tabla de usuarios ni contraseña por defecto.
- **Intentos de acceso limitados**: tras 5 contraseñas incorrectas seguidas
  desde la misma IP en 10 minutos, `/admin/login` bloquea intentos nuevos
  durante 10 minutos (`src/server/admin/rateLimit.ts`, en memoria — basta
  para el proceso único de un panel de un solo administrador; no persiste
  entre reinicios ni pretende sustituir un WAF).
- **No indexable**: `robots.txt` bloquea `/admin` y `/api/`, y además cada
  respuesta de esas rutas lleva la cabecera `X-Robots-Tag: noindex,
  nofollow`.
- **Contenido**: resumen (productos/comercios/ofertas activos — con el
  desglose real/demo —, última importación, cambios de precio recientes,
  ofertas sin revisar, estado de la BD y si la portada usa BD o el
  fallback demo — esto último depende de `realOffers`, nunca cuenta las
  ofertas demo como catálogo real), y listados de productos, comercios,
  ofertas, historial de importaciones (con detalle por ejecución) y
  errores. Los listados sí muestran también lo marcado como demo, siempre
  con su insignia "Demo" bien visible — solo la portada pública y el
  buscador lo excluyen.

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

Ninguno de estos pasos **requiere** `DATABASE_URL` para funcionar: sin ella,
`npm run build` genera el cliente de Prisma a partir del esquema (no se
conecta a ninguna base) y omite la migración sin más. Las páginas de
`/admin` se sirven siempre en modo dinámico (usan `cookies()` para la
sesión) y la portada pública y `/buscar` usan
`export const dynamic = "force-dynamic"` a propósito (ver "Cómo funciona el
respaldo a datos de demostración"), así que ninguna intenta consultar la
base durante el build en sí (Next no ejecuta esas páginas al compilar).

Si `DATABASE_URL` **sí** está definida (como en Hostinger una vez
configurada), `npm run build` comprueba la conexión y aplica las
migraciones pendientes automáticamente como parte del propio build — ver
"Qué buscar en los logs de compilación de Hostinger" en la sección de
despliegue. Sigue siendo seguro ejecutar `npm run build` en local sin
tocar nada real: solo aplica migraciones ya commiteadas, nunca las genera
ni borra datos.

Estos otros comandos también necesitan una base de datos real y quedan
fuera de la lista anterior — para comprobar o preparar un entorno con
`DATABASE_URL` a mano, sin esperar a un build completo:

```bash
npm run db:check      # comprueba la conexión sin escribir nada
npm run db:prepare    # aplica solo migraciones pendientes + resumen (--seed opcional)
```

### Integración continua (GitHub Actions)

`.github/workflows/ci.yml` ejecuta automáticamente, en cada pull request
hacia `main` y en cada push a `main`, prácticamente los mismos pasos de
esta sección: `npm ci`, `prisma migrate deploy` + `prisma generate` +
`next typegen` contra una MariaDB efímera y sintética (credenciales fijas,
exclusivas del job, nunca las de Hostinger), `tsc --noEmit`, `npm run
lint`, `npx vitest run`, `npm audit --audit-level=high` y `npm run build`.
No ejecuta el seed de demostración, no despliega nada y no escribe en
ningún servicio externo — solo valida. Las ejecuciones anteriores de la
misma rama se cancelan automáticamente al llegar un push nuevo.

## Preparación para tareas programadas

`scripts/import-csv.ts` está pensado para invocarse desde un cron o una
GitHub Action en una fase posterior (Fase 3), sin cambios: acepta un
fichero local, usa bloqueo distribuido para evitar solapes, y
`--deactivate-stale` puede ejecutarse aparte para desactivar (nunca
borrar) ofertas más viejas que `OFFER_STALE_AFTER_HOURS`. Esta fase
**no** activa ningún cron ni scraping real — solo deja el comando listo.

## Despliegue en Hostinger

No es posible usar `mcp.hostinger.com` desde este entorno (limitación
conocida); todo lo de abajo se hace desde el panel web de Hostinger y la
línea de comandos, sin depender de esa integración.

1. Hostinger despliega automáticamente al recibir cambios en `main` (ya
   configurado).
2. El propio `npm run build` (`prisma generate && tsx scripts/build-migrate.ts
   && next build`) ya prepara la base de datos automáticamente en cada
   despliegue — no hace falta ningún comando manual aparte ni un *post-deploy*
   configurado en Hostinger:
   - **Sin `DATABASE_URL`**: el paso se omite sin más y el build continúa
     normalmente; la web pública sigue sirviendo datos de demostración.
   - **Con `DATABASE_URL`**: comprueba la conexión primero (sin escribir
     nada) y, si conecta, aplica **solo** `prisma migrate deploy` — nunca
     `db push`, nunca `migrate reset`, nunca `--force-reset`, y nunca
     ejecuta el seed. Ver "Qué buscar en los logs de compilación" abajo
     para el texto exacto que confirma cada resultado.
   - **Si la conexión o la migración fallan**: el paso termina con error y
     `npm run build` se detiene ahí mismo — `next build` ni siquiera llega
     a ejecutarse, así que Hostinger no sustituye la versión ya publicada;
     el sitio en producción sigue funcionando tal cual estaba.
3. Para activar la base de datos en Hostinger:
   - Crea la base MySQL desde el panel de Hostinger (no reutilices la base
     de otro sitio ni la crees si ya existe una para Preciara).
   - Define `DATABASE_URL` en las variables de entorno del sitio (panel
     Hostinger → tu sitio → Variables de entorno; no la subas nunca al
     repositorio). Formato exacto:
     `mysql://usuario:contraseña@host:puerto/nombre_base_de_datos` — el host
     casi nunca es `localhost` en Hostinger (ver la sección de logs abajo
     para el mensaje exacto si te equivocas de host).
   - El siguiente despliegue (el propio `npm run build`) ya aplica las
     migraciones automáticamente. Si prefieres comprobarlo o aplicarlo tú
     mismo antes de esperar al despliegue: `npm run db:check` (solo
     comprueba la conexión, no escribe nada) y `npm run db:prepare`
     (valida variables, aplica solo migraciones pendientes, resumen final;
     `db:prepare` y el paso del build comparten la misma lógica de
     conexión — `scripts/lib/dbConnection.ts` — para no duplicarla). Añade
     `-- --seed` a `db:prepare` solo si quieres cargar los datos de
     demostración para verificar el circuito
     (`npm run db:prepare -- --seed`); el build **nunca** hace esto por su
     cuenta.
4. Para activar el panel técnico, define además `ADMIN_PASSWORD` y
   `ADMIN_SESSION_SECRET` (valores propios, largos y aleatorios — nunca los
   de este README) en las mismas variables de entorno del sitio. Genera
   `ADMIN_SESSION_SECRET` localmente con `openssl rand -hex 32` (o
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   si no tienes `openssl` a mano) y pégalo directamente en el panel de
   Hostinger — nunca lo escribas en un fichero que pueda subirse al
   repositorio.
5. Si falta `DATABASE_URL` en producción: la web pública sigue con el
   fallback de demostración y `/admin` permanece cerrado (404). No es un
   estado de error: es el comportamiento por defecto seguro.

**Desarrollo vs. producción**: en local se usa `db:migrate:dev` (crea y
aplica migraciones nuevas a partir de cambios en `schema.prisma`) contra
una base de pruebas propia, nunca contra la de Hostinger. En producción se
usa siempre `db:migrate:deploy` (dentro del paso automático del build, y
también dentro de `db:prepare` si lo ejecutas a mano), que solo aplica
migraciones ya commiteadas y probadas — nunca genera nada nuevo ni pide
confirmación interactiva.

### Qué buscar en los logs de compilación de Hostinger

Cada línea del paso de migración del build empieza por `[db:migrate]`,
para que sea fácil de encontrar entre el resto del log de `npm run build`:

| Situación | Texto exacto a buscar | Qué significa |
|---|---|---|
| Sin `DATABASE_URL` | `[db:migrate] Sin DATABASE_URL` | No hay base de datos configurada todavía; el build ha continuado igualmente con el fallback de demostración. Nada que revisar. |
| Conexión correcta | `[db:migrate] Conexión a MySQL verificada` | `DATABASE_URL` conecta correctamente. |
| Migraciones aplicadas | `[db:migrate] Migraciones aplicadas correctamente` | `prisma migrate deploy` terminó sin errores; el esquema está al día. |
| Fallo de conexión | `[db:migrate] ERROR: no se pudo conectar a la base de datos` | La línea siguiente trae el motivo ya saneado (nunca la contraseña ni la URL completa). Si el host no es el correcto — por ejemplo, si `DATABASE_URL` se dejó apuntando a `localhost` en vez del host real de MySQL en Hostinger — el mensaje es del estilo `Can't reach database server at` seguido del host configurado: revisa el host y el puerto de `DATABASE_URL` en las variables de entorno del sitio. |
| Fallo de migración | `[db:migrate] ERROR: fallo al aplicar las migraciones` | La conexión funcionaba pero `prisma migrate deploy` falló (p. ej. una migración incompatible con el estado actual de la base); revisa las líneas de Prisma justo encima — no incluyen la contraseña — y `npm run db:migrate:status` antes de reintentar. |

En cualquiera de los dos casos de error, el build entero termina con código
distinto de cero: Hostinger no llega a publicar esa versión y el sitio
público sigue sirviendo el despliegue anterior sin cambios.

**Para confirmar específicamente que se aplicó
`20260920214103_mark_example_csv_as_demo`** (la migración que corrige el
CSV de ejemplo marcado por error como catálogo real): busca en el mismo
log, justo antes de `[db:migrate] Migraciones aplicadas correctamente`,
la línea que imprime la propia CLI de Prisma:

```
Applying migration `20260920214103_mark_example_csv_as_demo`
```

Si no aparece esa línea (por ejemplo porque ya se aplicó en un despliegue
anterior), `prisma migrate status` la seguirá listando como aplicada; no
es un error, solo significa que no había nada pendiente esa vez. Para
comprobar el resultado en los datos, entra en `/admin` tras el despliegue:
el resumen debe mostrar la base conectada, la portada en fallback demo
(si esas 4 ofertas de ejemplo eran el único catálogo), `0` ofertas reales
y `4` ofertas demo; `/admin/ofertas` debe mostrar esas 4 filas con la
insignia "Demo".

### Cómo activar datos reales

1. Confirma que `DATABASE_URL` apunta a la base de datos correcta de
   Hostinger (nunca a la de otro sitio) — `npm run db:check` lo confirma
   sin escribir nada.
2. `npm run db:prepare` para asegurarte de que el esquema está al día (solo
   aplica migraciones pendientes, nunca destructivo).
3. Prepara un CSV real con el formato documentado arriba (nunca inventes
   comercios, precios ni disponibilidad: solo datos que tengas autorizados
   para publicar). Descarga la plantilla desde `/admin/importar` si no
   tienes un fichero de partida, y súbelo primero en modo "Simular" y luego
   de verdad.
4. Revisa `/admin/ofertas` y `/admin/errores` para confirmar que todo se
   importó como esperabas.
5. En cuanto haya al menos una oferta activa real, la portada pública y
   `/buscar` empiezan a mostrarla automáticamente (mismo diseño, sin
   redeploy adicional): `src/server/dataSource/*` deja de usar el fallback
   de demostración en cuanto detecta catálogo suficiente. El panel técnico
   (resumen, `/admin`) indica en todo momento si la portada está sirviendo
   base de datos o el respaldo de demostración.

### Cómo volver atrás si el despliegue falla

- Un fallo de build o de arranque en Hostinger no requiere revertir la
  base de datos: el build no depende de ella, así que basta con revertir
  el commit problemático en GitHub (`git revert`) y dejar que Hostinger
  vuelva a desplegar.
- Si una migración (`db:prepare` / `db:migrate:deploy`) diera problemas,
  Prisma no ejecuta nada destructivo por sí solo: `db:prepare` se detiene
  en el primer error sin tocar nada más. Revisa `npm run db:migrate:status`
  para ver qué quedó aplicado antes de intentar nada más, y no ejecutes
  `prisma migrate reset` (borra todos los datos) contra una base con
  datos reales.
- Si el panel técnico da problemas, basta con quitar `ADMIN_PASSWORD` /
  `ADMIN_SESSION_SECRET` de las variables de entorno para cerrarlo
  inmediatamente (404) sin afectar a la web pública.
- Si la portada pública muestra algo inesperado tras conectar la base de
  datos, quitar `DATABASE_URL` de las variables de entorno la devuelve de
  inmediato a los datos de demostración conocidos, sin tocar código ni
  revertir ningún commit.

## Hoja de ruta

- **Fase 1**: estructura, sistema visual, página principal y páginas
  legales con datos de demostración. *(hecho)*
- **Fase 2A**: esquema de base de datos (MySQL + Prisma), migraciones, seed
  idempotente, capa de acceso a datos, importador CSV con panel técnico
  privado, preparación para automatización. *(hecho)*
- **Fase 2B** (este repositorio): portada pública y `/buscar` conectados a
  la base de datos a través de `src/server/dataSource/*`, con respaldo
  automático y probado a datos de demostración, sin cambios visuales.
  *(hecho — ver estado arriba)*
- **Fase 3**: integración con una fuente de datos real y autorizada,
  automatización programada (cron/GitHub Actions) sobre
  `scripts/import-csv.ts`.
- **Fase 4**: más tiendas, alertas de precio, usuarios, blog.
