# Preciara

Comparador de precios y afiliación para el mercado español. Este repositorio
contiene el sitio web (Next.js), construido para desplegarse en Hostinger
sobre Node.js.

**Estado actual: Fase 1** — sistema visual, página principal y páginas
legales básicas, con datos de demostración. Todavía no hay base de datos ni
integraciones reales.

## Stack técnico

- [Next.js 16](https://nextjs.org) (App Router) + React 19
- TypeScript en modo estricto
- Tailwind CSS v4
- [lucide-react](https://lucide.dev) para iconografía

## Desarrollo local

Requiere Node.js 22 (igual que el entorno de Hostinger).

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

Antes de subir cambios, comprueba que todo pasa:

```bash
npm run lint          # ESLint
npx tsc --noEmit       # comprobación de tipos
npm run build          # build de producción
```

## Variables de entorno

Copia `.env.example` a `.env.local` y ajusta los valores. Ninguna clave o
secreto real debe subirse al repositorio.

## Estructura del proyecto

```
src/
  app/            Rutas (App Router): página principal, /buscar, páginas legales
  components/
    layout/       Cabecera y pie de página
    home/         Secciones de la página principal
    ui/           Componentes reutilizables (tarjetas, insignias, etc.)
    legal/        Plantilla de páginas legales
  data/demo/      Datos de demostración, centralizados y fáciles de sustituir
  lib/            Utilidades (formato de precios, etc.)
  types/          Tipos del dominio (reflejan el futuro esquema de base de datos)
```

## Datos de demostración

Todo lo que se ve en el sitio (precios, tiendas, historiales) vive en
`src/data/demo/` y está claramente marcado como ficticio en cada fichero. No
representa tiendas, precios ni ofertas reales. Sustituir estos datos por
datos reales (Fase 2/3) no debería requerir tocar los componentes visuales.

## Hoja de ruta

- **Fase 1** (este repositorio): estructura, sistema visual, página
  principal y páginas legales con datos de demostración.
- **Fase 2**: esquema de base de datos (MySQL + Prisma), migraciones, panel
  técnico de estado.
- **Fase 3**: integración con una fuente de datos real y autorizada,
  actualización automática vía GitHub Actions.
- **Fase 4**: más tiendas, alertas de precio, usuarios, blog.
