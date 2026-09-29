# Preciara

Comparador de precios y afiliación para el mercado español. Este repositorio
contiene el sitio web (Next.js), construido para desplegarse en Hostinger
sobre Node.js.

**Estado actual: Fase 3** — motor interno completo (base de datos MySQL +
Prisma, importador CSV, panel técnico privado), portada pública y buscador
leyendo de esa base de datos a través de `src/server/dataSource/*` (sin
cambios visuales respecto al diseño aprobado), y **sincronización automática
real con Awin** ya conectada mediante GitHub Actions (ver
[Sincronización automática con Awin](#sincronización-automática-con-awin)
más abajo). Sin `DATABASE_URL`, con la base vacía, o si la conexión falla, la
web sigue funcionando automáticamente con los datos de demostración de
`src/data/demo/*` (ver [Cómo funciona el respaldo a datos de
demostración](#cómo-funciona-el-respaldo-a-datos-de-demostración)); lo mismo
ocurre mientras Awin no tenga ningún anunciante aprobado todavía: cero
productos reales importados es el estado correcto, no un fallo.

## Stack técnico

- [Next.js 16](https://nextjs.org) (App Router) + React 19
- TypeScript en modo estricto
- Tailwind CSS v4
- [lucide-react](https://lucide.dev) para iconografía
- [Prisma 6](https://www.prisma.io) + MySQL (Fase 2A)
- [Vitest](https://vitest.dev) para pruebas
- Sincronización de catálogo con [Awin](https://www.awin.com) (Fase 3, `src/server/catalogSync/*`)

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
  sync-awin.ts           Ejecutor CLI alternativo de un ciclo de Awin
                        (`npm run catalog:sync:awin`) — no es la vía que usa
                        GitHub Actions hoy, ver "Sincronización automática
                        con Awin" más abajo
  lib/dbConnection.ts    Comprobación de conexión compartida (build-migrate/db-check)
  lib/sanitizeError.ts    Oculta credenciales de cualquier mensaje de error
src/
  app/
    (site)/          Grupo de rutas públicas: portada, /categoria/[slug],
                      /producto/[slug], /categorias, /buscar, /guias,
                      /sobre-preciara, /para-tiendas, /contacto,
                      /metodologia, páginas legales
                      (comparte layout con Header/Footer; las URLs no cambian)
    admin/            Panel técnico privado (/admin/**), layout propio:
                      resumen, productos, ofertas, comercios, importar,
                      importaciones, errores, sincronizacion (Awin/eBay)
    api/admin/         Endpoints protegidos usados por el panel
                      (import/ para subir CSV, import/template/ para la plantilla)
    api/jobs/awin-sync/ Endpoint que GitHub Actions dispara (firmado por HMAC)
                      para ejecutar un ciclo de sincronización de Awin
                      dentro del proceso de Hostinger — ver "Sincronización
                      automática con Awin" más abajo
    api/ebay/marketplace-account-deletion/ Endpoint de cumplimiento
                      obligatorio de eBay (Marketplace Account Deletion);
                      NO es una fuente de productos
    robots.ts          Bloquea /admin y /api/ para buscadores
    sitemap.ts          Sitemap dinámico (páginas estáticas + categorías/productos reales)
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
                          historial, estado del sistema, panel técnico,
                          resumen de sincronizaciones — syncOverview.ts)
    importer/              Parser CSV, validación, orquestación de la
                          importación, detección/desactivación de ofertas viejas,
                          bloqueo contra ejecuciones simultáneas (importador manual)
    catalogSync/            Núcleo de sincronización multi-fuente y adaptador de
                          Awin (parsers, transporte, validación, GTIN, políticas
                          de metadatos, orquestador) — ver "Sincronización
                          automática con Awin" más abajo
    jobs/                    Verificación HMAC de la petición firmada que
                          GitHub Actions envía al endpoint de Awin
    ebay/                    Verificación de firmas/OAuth para el endpoint
                          de cumplimiento de eBay
    dataSource/             Capa que decide BD vs. demostración para la portada
                          pública y el buscador, y adapta los datos de Prisma
                          a los tipos que ya esperan los componentes
    admin/auth.ts           Autenticación del panel técnico (sin tabla de usuarios)
    admin/rateLimit.ts       Límite de intentos fallidos en /admin/login
  data/demo/            Datos de demostración, centralizados y fáciles de sustituir
  lib/                   Utilidades (formato de precios, contacto, SEO, etc.)
  types/                  Tipos del dominio usados por los componentes actuales
  generated/prisma/       Cliente de Prisma generado (NO se commitea)
.github/workflows/
  ci.yml                Validación en cada PR/push a main
  awin-catalog-sync.yml Disparador de la sincronización de Awin (cron + manual)
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
| `OFFER_STALE_AFTER_HOURS` | No (por defecto 72) | Horas sin revisar una oferta del importador CSV antes de considerarla "vieja" (`--deactivate-stale` de `scripts/import-csv.ts`). No afecta a Awin, que tiene su propia variable (`AWIN_DEACTIVATE_STALE_AFTER_HOURS`, ver abajo). |
| `GOOGLE_SITE_VERIFICATION` | No | Código de verificación de propiedad de Google Search Console (método "etiqueta HTML"). Sin ella, la etiqueta `<meta name="google-site-verification">` simplemente no aparece. |
| `NEXT_PUBLIC_CONTACT_EMAIL` | No | Correo de contacto público mostrado en `/contacto`. Sin ella (o con un valor inválido), `/contacto` muestra "canal en preparación" en vez de un enlace roto. |
| `AWIN_DATAFEED_API_KEY` | Solo para sincronizar Awin de verdad | API key de "Product Feed List Download" de Awin. Es también el secreto HMAC compartido con GitHub Actions para autorizar `POST /api/jobs/awin-sync` — ver [Sincronización automática con Awin](#sincronización-automática-con-awin). Ausente, vacía o solo espacios: el endpoint responde 404 siempre y el script CLI se detiene antes de tocar Awin. |
| `AWIN_DATAFEED_LIST_URL` | No | Enlace completo de "Descargar lista" de la interfaz nueva de Awin. Opcional para instalaciones Legacy (se construye a partir de `AWIN_DATAFEED_API_KEY`). |
| `AWIN_DEACTIVATE_STALE_AFTER_HOURS` | No | Horas sin refrescar una oferta de Awin antes de que pueda desactivarse en la pasada final de cada anunciante. **Si se omite (opción por defecto), ningún ciclo de Awin desactiva nada**, sin importar lo demás — ver la regla conservadora en [Sincronización automática con Awin](#sincronización-automática-con-awin). Un valor inválido (no numérico, ≤0, o mayor de un año) nunca detiene el ciclo: se registra un aviso y se trata como si estuviera ausente. |
| `EBAY_MARKETPLACE_DELETION_ENDPOINT` / `EBAY_MARKETPLACE_DELETION_VERIFICATION_TOKEN` / `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` | Solo para el endpoint de cumplimiento de eBay | Requisito obligatorio de eBay (`/api/ebay/marketplace-account-deletion`) — NO es una fuente de productos. Ver `.env.example` para el detalle de cada una. |
| `NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG` | No | Tag de Afiliado de Amazon (programa de Afiliados de Amazon España), usado por `buildAmazonAffiliateUrl` (`src/lib/amazon.ts`) para construir `https://www.amazon.es/dp/{ASIN}?tag={tag}`. Prefijo `NEXT_PUBLIC_` a propósito: el tag siempre viaja visible en la propia URL de afiliado, nunca es un secreto — a diferencia de `AWIN_DATAFEED_API_KEY`. Al ser `NEXT_PUBLIC_`, tiene que estar definida ya en el momento del **build** (`next build`), no solo en tiempo de ejecución: añádela en las variables de entorno de Hostinger antes del próximo despliegue si quieres que quede incluida. Sin ella, `buildAmazonAffiliateUrl` devuelve `null` en vez de inventar un tag. Todavía no hay ningún adaptador que traiga productos reales de Amazon (ver `OfferSource` en `prisma/schema.prisma`) — esta variable queda preparada para cuando exista. |

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

Este importador CSV concreto sigue siendo siempre manual — no hay ningún
cron ni GitHub Action que lo dispare automáticamente, ni scraping, ni
integración con Amazon. La Fase 3 sí conectó una fuente oficial real y
automática (Awin, mediante GitHub Actions) usando el núcleo de
sincronización aparte de `src/server/catalogSync/*` — ver [Sincronización
automática con Awin](#sincronización-automática-con-awin) — sin tocar
este circuito CSV manual, que sigue disponible para catálogo cargado a
mano.

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
  ofertas, historial de importaciones CSV (`/admin/importaciones`, con
  detalle por ejecución) y errores. `/admin/sincronizacion` muestra por
  separado el estado de las fuentes automáticas (Awin/eBay): última
  ejecución, estado, duración y el historial paginado de sus propios
  `ImportRun` — ver [Sincronización automática con
  Awin](#sincronización-automática-con-awin). Los listados sí muestran
  también lo marcado como demo, siempre con su insignia "Demo" bien
  visible — solo la portada pública y el buscador lo excluyen.

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

Dos workflows en `.github/workflows/`:

- **`ci.yml`**: en cada pull request hacia `main` y en cada push a `main`,
  ejecuta prácticamente los mismos pasos de esta sección: `npm ci`,
  `prisma migrate deploy` + `prisma generate` + `next typegen` contra una
  MariaDB efímera y sintética (credenciales fijas, exclusivas del job,
  nunca las de Hostinger), `tsc --noEmit`, `npm run lint`, `npx vitest
  run`, `npm audit --audit-level=high` y `npm run build` (el mismo
  script que usa Hostinger, con Webpack). No ejecuta el seed de
  demostración, no despliega nada y no escribe en ningún servicio
  externo — solo valida. Las ejecuciones anteriores de la misma rama se
  cancelan automáticamente al llegar un push nuevo.
- **`awin-catalog-sync.yml`**: dispara la sincronización real del catálogo
  de Awin — ver la siguiente sección.

## Sincronización automática con Awin

Preciara importa su catálogo real desde [Awin](https://www.awin.com), la
red de afiliación, de forma completamente automática: en cuanto Awin
aprueba un anunciante (`Membership Status: Joined`), sus productos se
descargan, validan y publican sin ninguna intervención manual. Mientras
ningún anunciante esté aprobado, el sistema sigue funcionando y termina
cada ciclo en verde como un "no-op" informativo — cero productos
importados es el estado correcto, nunca un fallo.

### Arquitectura del disparador (por qué GitHub Actions no toca la base de datos)

GitHub Actions **nunca** se conecta a MySQL ni ejecuta la sincronización
por sí mismo — actúa solo como reloj. En cada disparo:

1. `.github/workflows/awin-catalog-sync.yml` firma el cuerpo `{"dryRun": true|false}`
   con HMAC-SHA256, usando `AWIN_DATAFEED_API_KEY` como secreto compartido
   (`secrets.AWIN_DATAFEED_API_KEY` en GitHub, la misma variable de entorno
   en Hostinger — nunca viajan valores distintos a cada lado).
2. Hace `POST https://preciara.es/api/jobs/awin-sync` con las cabeceras
   `x-preciara-timestamp` y `x-preciara-signature`.
3. `src/app/api/jobs/awin-sync/route.ts` verifica esa firma
   (`src/server/jobs/awinSyncRequestAuth.ts`, ventana de 5 minutos),
   responde `202 Accepted` de inmediato, y continúa el trabajo real **dentro
   del proceso Next.js de Hostinger** mediante la API `after()` de Next.js
   — así GitHub Actions no necesita mantener una conexión abierta ni
   acceso de red a la base de datos.
4. Dentro de ese proceso, `runAwinCatalogSyncCycle()`
   (`src/server/catalogSync/awinOrchestrator.ts`) ejecuta el ciclo completo:
   descarga la lista de feeds, selecciona solo los `Joined`, agrupa por
   anunciante, descarga y valida cada feed de productos, y crea/actualiza
   productos y ofertas en la base de datos.

Sin `AWIN_DATAFEED_API_KEY` configurada, el endpoint responde `404` siempre
(cerrado por defecto, sin revelar que la integración existe).

### Frecuencia de ejecución

`awin-catalog-sync.yml` se dispara de dos formas:

- **Programada** (`schedule`): dos veces al día, `17 4 * * *` y
  `17 16 * * *` (≈06:17 y ≈18:17 en Madrid en horario de verano). Ambas
  son sincronizaciones **reales** (`dryRun: false`) — nunca simulacros.
  Antes de una ejecución programada, el workflow espera aleatoriamente
  entre 10 y 120 segundos para no coincidir siempre con el pico de otros
  publicadores de Awin.
- **Manual** (`workflow_dispatch`, desde la pestaña Actions de GitHub):
  con una casilla `dry_run`, **marcada `true` por defecto** — hay que
  desmarcarla explícitamente para forzar una sincronización real a mano.

`concurrency: { group: awin-catalog-sync, cancel-in-progress: false }`
evita que dos ejecuciones del workflow corran a la vez (una nueva espera
en cola, nunca cancela la anterior a medias); `timeout-minutes: 10` acota
cada intento.

### Reintentos ante un rechazo transitorio

Si Hostinger (o una capa delante de la aplicación) rechaza la petición
firmada con algo distinto de `202`, el workflow reintenta hasta 3 veces,
**recalculando la firma HMAC en cada intento** (nunca reenvía una firma ya
usada, para no caer fuera de la ventana de 5 minutos), con una espera de
5 s y luego 15 s entre intentos. Se registra un fragmento truncado (300
caracteres) del cuerpo de la respuesta de Hostinger para ayudar a
diagnosticar — ese cuerpo nunca puede contener la API key, la genera
Hostinger/la capa que bloquea, no la propia ruta. Si los 3 intentos
fallan, la ejecución de GitHub Actions termina en rojo — visible en la
pestaña Actions.

### `dryRun`: cómo funciona

`dryRun: true` (el modo por defecto en la ejecución manual) recorre
exactamente el mismo código real de descubrimiento, descarga, validación
y aplicación de filas — **nunca escribe nada en la base de datos**: ni
crea ni actualiza productos, comercios u ofertas, ni desactiva nada, ni
crea ningún `ImportRun`. Sirve para comprobar de forma segura qué haría
un ciclo real (cuántos feeds se descubren/aprueban, cuántas filas serían
válidas) sin ningún riesgo. Las ejecuciones programadas **nunca** son
`dryRun`: siempre son sincronizaciones reales.

### Bloqueo contra ejecuciones simultáneas

Dos niveles de bloqueo distribuido (modelo `SyncLock`, lease con
caducidad — nunca `GET_LOCK` de MySQL, incompatible con el pool de
conexiones de Prisma; ver `src/server/importer/distributedLock.ts`):

- **Por fuente** (`preciara_catalog_sync:AWIN`): lo adquiere cada llamada
  individual a `runCatalogSync` (`src/server/catalogSync/syncRun.ts`),
  para que dos aplicaciones de filas nunca se pisen.
- **De ciclo completo** (`preciara_catalog_cycle:AWIN`, nombre distinto a
  propósito para no autobloquearse): lo adquiere `runAwinCatalogSyncCycle`
  ANTES de descargar la lista de feeds y lo mantiene hasta terminar todos
  los anunciantes — evita que dos ciclos completos de Awin se
  intercalen entre sí.

Si un bloqueo ya está ocupado, el ciclo nuevo se aborta limpiamente sin
tocar nada (nunca corrompe ni deja a medias el trabajo del que ya estaba
en curso); si el proceso muere sin liberar el lease, este caduca solo
(nunca queda retenido para siempre).

### Protección ante feeds incompletos, vacíos o inválidos

- Un fallo al descargar la lista completa de feeds aborta todo el ciclo
  **antes de tocar ningún producto**.
- Un fallo en un feed individual (transporte, parser, filas rechazadas)
  no impide procesar los demás feeds ni los demás anunciantes.
- Un feed vacío (0 filas válidas) nunca se trata como si el anunciante ya
  no tuviera productos: solo bloquea la desactivación de ese anunciante
  (ver más abajo), nunca borra ni desactiva nada por sí solo.

### Desactivación de ofertas antiguas de Awin

Existe una regla **deliberadamente conservadora** para desactivar (nunca
borrar) ofertas de Awin que llevan mucho tiempo sin verse en un feed. Un
anunciante concreto solo desactiva sus ofertas obsoletas si **TODAS**
estas condiciones se cumplen a la vez en un mismo ciclo (ver
`evaluateDeactivationEligibility` en `awinOrchestrator.ts`):

1. No es `dryRun`.
2. Se definió explícitamente `AWIN_DEACTIVATE_STALE_AFTER_HOURS` — **si se
   omite, ningún ciclo desactiva nada, sin importar lo demás** (opción por
   defecto, la más segura).
3. La lista global de feeds no tuvo ninguna fila inválida.
4. **Todos** los feeds de ese anunciante concreto terminaron completos, sin
   fallos.
5. **Ninguno** de sus feeds llegó vacío.
6. **Ninguna** fila de ese anunciante fue inválida.

Un fallo parcial, un feed vacío o una respuesta inesperada de Awin nunca
desactivan nada — como mucho, bloquean la desactivación de ese ciclo. Si
`AWIN_DEACTIVATE_STALE_AFTER_HOURS` tiene un valor inválido (no numérico,
≤0, o más de un año), el ciclo **nunca se bloquea ni falla** por eso: se
registra un aviso y se trata como si la variable no estuviera definida
(ningún anunciante desactiva nada ese ciclo).

### Cómo revisar una ejecución

- **Panel técnico** (`/admin/sincronizacion`, requiere `ADMIN_PASSWORD`):
  última ejecución por fuente (Awin/eBay), su estado, duración, y el
  historial paginado de ejecuciones — cada fila es un `ImportRun` con su
  `source` en forma `sync:awin:feed:<advertiserId>:<feedId>` (identifica
  anunciante y feed exactos), contadores (`productsCreated`,
  `productsUpdated`, `offersCreated`, `offersUpdated`, `rowsRejected`) y
  `errorSummary` si algo falló.
- **Logs estructurados** (pestaña Actions de GitHub, o el log del proceso
  de Hostinger): cada ciclo completo termina con un evento
  `awin_sync_job_done` (disparo HTTP) o `awin_sync_done` (CLI) en JSON de
  una sola línea, con los agregados de TODO el ciclo — no solo de un
  feed: `feedsDiscovered`, `feedsApproved`, `advertisersProcessed`,
  `validRowsTotal`, `invalidRowsTotal`, `productsCreatedTotal`,
  `productsUpdatedTotal`, `offersCreatedTotal`, `offersUpdatedTotal`,
  `staleDeactivatedTotal`, `deactivateStaleAfterHoursConfigured`,
  `durationMs`, y `feedFailures` (motivo por feed fallido, sin datos
  sensibles). Ninguno de estos logs contiene nunca la API key ni la URL
  real de un feed.
- **Señal mínima de éxito**: con al menos un anunciante aprobado,
  `feedsApproved` > 0 y `validRowsTotal` > 0 confirman que el feed se
  descargó y validó correctamente; `productsCreatedTotal`/
  `offersCreatedTotal` > 0 confirman que además se escribió en la base de
  datos. `ok: true` en el propio evento resume que ningún feed falló y
  ningún anunciante quedó incompleto ese ciclo.

### Ejecución manual alternativa (CLI)

`npm run catalog:sync:awin` (`scripts/sync-awin.ts`, con `-- --dry-run`
opcional) invoca exactamente el mismo `runAwinCatalogSyncCycle()` desde la
línea de comandos, pensado para un cron propio de Hostinger si alguna vez
se prefiere esa vía en vez del endpoint HTTP — hoy la vía real en
producción es el endpoint disparado por GitHub Actions. Usa las mismas
variables de entorno (`AWIN_DATAFEED_API_KEY`, `AWIN_DATAFEED_LIST_URL`,
`AWIN_DEACTIVATE_STALE_AFTER_HOURS`) leídas directamente del proceso, y
termina con códigos de salida propios (0 = correcto, 1 = con fallos, 2 =
bloqueo de ciclo ocupado, 3 = error de configuración).

### `scripts/import-csv.ts` (importador CSV, sin cron propio)

A diferencia de Awin, el importador CSV histórico (ver
[Importador CSV](#importador-csv) más abajo) sigue siendo siempre manual —
no está conectado a ningún workflow ni cron automático. `--deactivate-stale`
puede ejecutarse aparte para desactivar (nunca borrar) ofertas del CSV más
viejas que `OFFER_STALE_AFTER_HOURS`.

## Despliegue en Hostinger

No es posible usar `mcp.hostinger.com` desde este entorno (limitación
conocida); todo lo de abajo se hace desde el panel web de Hostinger y la
línea de comandos, sin depender de esa integración.

1. Hostinger despliega automáticamente al recibir cambios en `main` (ya
   configurado).
2. El propio `npm run build` (`prisma generate && tsx scripts/build-migrate.ts
   && next build --webpack && tsx scripts/touch-passenger-restart.ts`) ya
   prepara la base de datos automáticamente en cada despliegue — no hace
   falta ningún comando manual aparte ni un *post-deploy* configurado en
   Hostinger. El build usa Webpack de forma explícita (`--webpack`) en vez
   del Turbopack por defecto de Next 16: en el entorno de build de
   Hostinger, Turbopack falla con `TurbopackInternalError` al procesar
   `src/app/globals.css` (un fallo del binario nativo de Turbopack en ese
   entorno concreto, no un error real de CSS) — Webpack no tiene ese
   problema.
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
   - **Último paso, `tsx scripts/touch-passenger-restart.ts`**: crea o
     actualiza `tmp/restart.txt`. El hosting de Node.js de Hostinger
     (identificable por las cabeceras `panel: hpanel` / `server: hcdn` en
     cualquier respuesta pública) funciona sobre Phusion Passenger, que NO
     recarga el código en cada despliegue por sí solo: mantiene vivos los
     procesos ya arrancados y solo los recicla cuando cambia la fecha de
     modificación de ese fichero (mecanismo oficial de Passenger). Sin
     este paso, un build sin ningún error puede dejar el sitio sirviendo
     indefinidamente el proceso Node.js viejo — visto en producción tras
     las PR #48/#49/#50 (el panel de Hostinger mostraba build y "reinicio"
     sin errores, pero la portada seguía con el comportamiento de antes de
     esas tres PRs; confirmado con las cabeceras HTTP reales de la
     portada, que ya traían `Cache-Control: no-store` de Next.js y
     `x-hcdn-cache-status: DYNAMIC` — descartando cualquier capa de caché,
     de Next.js o de la CDN de Hostinger, como causa). Inofensivo en
     cualquier otro hosting: solo crea/actualiza un fichero vacío dentro
     de `tmp/` (en `.gitignore`, nunca se commitea).
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
- **Fase 3**: integración con una fuente de datos real y autorizada
  (Awin), con sincronización automática programada vía GitHub Actions —
  ver [Sincronización automática con Awin](#sincronización-automática-con-awin).
  *(hecho — conectado y en producción; cero productos reales importados
  mientras Awin no tenga ningún anunciante aprobado es el estado correcto,
  no un fallo pendiente)*. También en esta fase: endpoint de cumplimiento
  obligatorio de eBay (Marketplace Account Deletion) — NO es una fuente de
  catálogo, solo un requisito de la API de eBay. *(hecho)*
- **Fase 4**: más fuentes de catálogo (p. ej. eBay como fuente real de
  productos, hoy solo reservado en el esquema), alertas de precio, cuentas
  de usuario, blog. *(pendiente)*
