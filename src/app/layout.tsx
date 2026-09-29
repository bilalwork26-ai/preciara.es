import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

/**
 * Fraunces y Plus Jakarta Sans se sirven en local (`next/font/local`), no
 * con `next/font/google`: ese segundo camino descarga los ficheros de
 * fuente desde los servidores de Google DURANTE `next build`, y si el
 * entorno de build de Hostinger no puede alcanzarlos, el build entero
 * falla con "TypeError: Cannot read properties of null (reading '1')"
 * (`next/dist/compiled/@next/font/dist/google/loader.js`) — sin que sea
 * un error real de ningún fichero de la app. Los `.woff2` de aquí abajo
 * son exactamente los mismos pesos/subset que se pedían antes
 * (`subsets: ["latin"]`, mismos pesos), extraídos de los paquetes
 * `@fontsource/fraunces`/`@fontsource/plus-jakarta-sans` (licencia SIL
 * Open Font License, ver el `LICENSE` junto a cada fuente) — el build ya
 * no depende de ninguna red externa para compilar.
 */
const fraunces = localFont({
  variable: "--font-fraunces",
  src: [
    { path: "./fonts/fraunces/fraunces-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/fraunces/fraunces-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/fraunces/fraunces-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
});

const jakarta = localFont({
  variable: "--font-jakarta",
  src: [
    { path: "./fonts/plus-jakarta-sans/plus-jakarta-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/plus-jakarta-sans/plus-jakarta-sans-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/plus-jakarta-sans/plus-jakarta-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/plus-jakarta-sans/plus-jakarta-sans-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://preciara.es";

/**
 * Verificación de propiedad de Google Search Console (método "etiqueta
 * HTML"). Sin `GOOGLE_SITE_VERIFICATION`, `verification` simplemente no se
 * incluye: nunca se inventa un código de verificación falso.
 */
const googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Preciara — Precios claros. Compras inteligentes.",
    template: "%s · Preciara",
  },
  description:
    "Compara precios entre tiendas españolas, sigue el historial y detecta bajadas de precio verificadas antes de comprar.",
  openGraph: {
    title: "Preciara — Precios claros. Compras inteligentes.",
    description:
      "Compara precios entre tiendas españolas, sigue el historial y detecta bajadas de precio verificadas antes de comprar.",
    locale: "es_ES",
    siteName: "Preciara",
    type: "website",
  },
  ...(googleSiteVerification ? { verification: { google: googleSiteVerification } } : {}),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${fraunces.variable} ${jakarta.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-white text-navy-900">{children}</body>
    </html>
  );
}
