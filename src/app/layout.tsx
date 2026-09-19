import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://preciara.es";

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
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${fraunces.variable} ${jakarta.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-ivory text-navy-900">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
